(function () {
  'use strict';

  /* ---------------------------------------------------------- 1. UTILITÁRIOS ---------------------------------------------------------- */

  const $ = (sel, raiz) => (raiz || document).querySelector(sel);
  const $$ = (sel, raiz) => Array.from((raiz || document).querySelectorAll(sel));

  function criar(tag, atributos, filhos) {
    const el = document.createElement(tag);
    Object.entries(atributos || {}).forEach(([k, v]) => {
      if (v === undefined || v === null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'texto') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    [].concat(filhos || []).forEach((f) => {
      if (f === null || f === undefined || f === false) return;
      el.appendChild(typeof f === 'string' ? document.createTextNode(f) : f);
    });
    return el;
  }

  function normalizarTexto(texto) {
    return String(texto || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  }

  function formatarData(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
  }

  function hojeISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const SEXO = { femea: 'Fêmea', macho: 'Macho', 'nao-identificado': 'Não identificado' };

  // Imagem de reserva enquanto a foto real ainda não foi colocada em Media/
  const SEM_FOTO = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">' +
    '<rect width="400" height="300" fill="#DFF2FD"/>' +
    '<g fill="#1489D8" opacity=".55"><circle cx="150" cy="130" r="22"/><circle cx="200" cy="105" r="22"/>' +
    '<circle cx="250" cy="130" r="22"/><ellipse cx="200" cy="185" rx="48" ry="38"/></g>' +
    '<text x="200" y="262" font-family="Arial" font-size="16" fill="#0873BE" text-anchor="middle">sem foto</text></svg>'
  );

  function imagemComReserva(img, src, alt) {
    img.alt = alt || '';
    img.addEventListener('error', function aoFalhar() {
      img.removeEventListener('error', aoFalhar);
      img.src = SEM_FOTO;
    });
    img.src = src || SEM_FOTO;
    return img;
  }

  // caminhos como "Media/Animais Perdidos/Cachorro/Cachorro 1.jpg" têm espaços
  const urlFoto = (caminho) => (caminho ? encodeURI(caminho) : null);

  function params() {
    return new URLSearchParams(location.search);
  }

  // Só aceita redirecionar para páginas internas do site (evita "open redirect")
  function destinoSeguro(valor, padrao) {
    return /^[a-z0-9-]+\.html(\?[\w=&%.\-]*)?$/i.test(valor || '') ? valor : padrao;
  }

  function paginaAtual() {
    return location.pathname.split('/').pop() || 'tela-inicial.html';
  }

  /* ----- aviso na tela (substitui os alert) ----- */

  function aviso(mensagem, tipo) {
    let area = $('.toast-area');
    if (!area) {
      area = criar('div', { class: 'toast-area', role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(area);
    }
    const t = criar('div', { class: 'toast ' + (tipo || ''), texto: mensagem });
    area.appendChild(t);
    setTimeout(() => t.remove(), 4500);
  }

  /* ----------------------------------------------------------
     2. CLIENTE DA API + SESSÃO
     ---------------------------------------------------------- */

  const CHAVE_TOKEN = 'achepet_token';
  const CHAVE_USUARIO = 'achepet_usuario';

  const sessao = {
    token: () => localStorage.getItem(CHAVE_TOKEN),
    usuario() {
      try { return JSON.parse(localStorage.getItem(CHAVE_USUARIO)); } catch { return null; }
    },
    entrar(token, usuario) {
      localStorage.setItem(CHAVE_TOKEN, token);
      localStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
    },
    sair() {
      localStorage.removeItem(CHAVE_TOKEN);
      localStorage.removeItem(CHAVE_USUARIO);
    },
    logado() { return !!localStorage.getItem(CHAVE_TOKEN); },
  };

  async function api(caminho, { metodo = 'GET', corpo } = {}) {
    const cabecalhos = {};
    if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';
    if (sessao.token()) cabecalhos.Authorization = 'Bearer ' + sessao.token();

    let resposta;
    try {
      resposta = await fetch('/api' + caminho, {
        method: metodo,
        headers: cabecalhos,
        body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      });
    } catch {
      throw new Error('Sem conexão com o servidor. Verifique se ele está rodando.');
    }

    let dados = {};
    const ehJson = (resposta.headers.get('content-type') || '').includes('application/json');
    if (ehJson) { try { dados = await resposta.json(); } catch { /* resposta vazia */ } }

    // Resposta que não é do servidor do AchePet (ex.: Live Server, file://, outro host)
    if (!ehJson && (!resposta.ok || location.protocol === 'file:')) {
      throw new Error('O servidor do AchePet não está respondendo. Rode "npm start" no terminal e acesse http://localhost:3000 (não abra pelo Live Server nem direto pelo arquivo).');
    }

    if (!resposta.ok) {
      if (resposta.status === 401 && sessao.token()) sessao.sair();
      const erro = new Error(dados.erro || 'Algo deu errado. Tente novamente.');
      erro.status = resposta.status;
      erro.campos = dados.campos || {};
      throw erro;
    }
    return dados;
  }

  function exigirLogin() {
    if (sessao.logado()) return true;
    aviso('Entre na sua conta para continuar.', 'erro');
    const destino = paginaAtual() + location.search;
    setTimeout(() => { location.href = 'login.html?next=' + encodeURIComponent(destino); }, 900);
    return false;
  }

  /* ----------------------------------------------------------
     3. CABEÇALHO (login / conta / sair) E TEMA
     ---------------------------------------------------------- */

  function ajustarMenu() {
    const nav = $('.main-nav');
    if (!nav) return;
    const linkLogin = $('a[href="login.html"]', nav);
    if (!linkLogin || !sessao.logado()) return;

    const usuario = sessao.usuario();
    const nomeCompleto = usuario && usuario.nome ? usuario.nome.trim() : '';
    const primeiroNome = nomeCompleto ? nomeCompleto.split(/\s+/)[0] : 'Minha conta';
    linkLogin.textContent = '';
    linkLogin.append(
      criar('span', { class: 'nav-avatar', texto: (nomeCompleto || 'M').charAt(0).toUpperCase() }),
      criar('span', { class: 'nav-nome', texto: primeiroNome }),
    );
    linkLogin.classList.add('nav-conta');
    linkLogin.href = 'meus-animais.html';
    linkLogin.title = nomeCompleto ? 'Minha conta — ' + nomeCompleto : 'Minha conta';
    if (paginaAtual() === 'meus-animais.html') linkLogin.classList.add('active');
    else if (document.body.dataset.page !== 'login') linkLogin.classList.remove('active');

    const sair = criar('a', { href: '#', class: 'nav-sair', texto: 'SAIR' });
    sair.addEventListener('click', (e) => {
      e.preventDefault();
      sessao.sair();
      aviso('Você saiu da sua conta.', 'sucesso');
      setTimeout(() => { location.href = 'tela-inicial.html'; }, 600);
    });
    linkLogin.insertAdjacentElement('afterend', sair);

    // confirma no servidor se a sessão ainda vale (se não valer, volta ao menu de visitante)
    api('/auth/eu').then((r) => {
      localStorage.setItem(CHAVE_USUARIO, JSON.stringify(r.usuario));
    }).catch(() => {
      if (!sessao.logado()) location.reload();
    });
  }

  function iniciarCabecalho() {
    const cab = $('.site-header');
    if (!cab) return;
    const nav = $('.main-nav', cab);

    const aoRolar = () => cab.classList.toggle('rolou', window.scrollY > 4);
    aoRolar();
    window.addEventListener('scroll', aoRolar, { passive: true });

    if (!nav) return;
    const botao = criar('button', { type: 'button', class: 'nav-hamburguer', 'aria-label': 'Abrir menu', 'aria-expanded': 'false' });
    botao.append(criar('span'), criar('span'), criar('span'));
    ($('.header-container', cab) || cab).appendChild(botao);

    const alternar = (abrir) => {
      nav.classList.toggle('aberto', abrir);
      botao.setAttribute('aria-expanded', String(abrir));
      botao.setAttribute('aria-label', abrir ? 'Fechar menu' : 'Abrir menu');
    };
    botao.addEventListener('click', (e) => { e.stopPropagation(); alternar(!nav.classList.contains('aberto')); });
    nav.addEventListener('click', (e) => { if (e.target.closest('a[href]:not([href="#"])')) alternar(false); });
    document.addEventListener('click', (e) => { if (!cab.contains(e.target)) alternar(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') alternar(false); });
    window.addEventListener('resize', () => { if (window.innerWidth > 980) alternar(false); });
  }

  function iniciarTema() {
    const botao = $('#themeToggle');
    const raiz = document.documentElement;
    const escuro = () => raiz.getAttribute('data-tema') === 'escuro';
    const atualizar = () => {
      if (!botao) return;
      botao.classList.toggle('active', escuro());
      botao.setAttribute('aria-pressed', String(escuro()));
      botao.setAttribute('aria-label', escuro() ? 'Ativar modo claro' : 'Ativar modo escuro');
      botao.title = escuro() ? 'Modo claro' : 'Modo escuro';
    };
    atualizar();
    if (!botao) return;
    botao.addEventListener('click', () => {
      raiz.classList.add('tema-anim');
      if (escuro()) raiz.removeAttribute('data-tema'); else raiz.setAttribute('data-tema', 'escuro');
      try { localStorage.setItem('achepet_tema', escuro() ? 'escuro' : 'claro'); } catch { /* ignora */ }
      atualizar();
      setTimeout(() => raiz.classList.remove('tema-anim'), 350);
    });
  }

  /* ----------------------------------------------------------
     4. CARDS E MURAL
     ---------------------------------------------------------- */

  function paginaDetalhe(animal) {
    return (animal.status === 'perdido' ? 'procurado.html' : 'encontrado.html') + '?id=' + animal.id;
  }

  function criarCard(a) {
    const perdido = a.status === 'perdido';
    const img = imagemComReserva(criar('img'), urlFoto(a.foto), (perdido ? 'Perdido: ' : 'Encontrado: ') + a.nome);
    img.loading = 'lazy';

    const card = criar('article', {
      class: 'pet-card', tabindex: '0', role: 'link',
      'data-id': a.id, 'data-cidade': a.cidade,
      'aria-label': `${a.nome}, ${perdido ? 'perdido' : 'encontrado'} em ${a.cidade}`,
    }, [
      img,
      criar('span', { class: 'pet-status ' + (perdido ? 'lost' : 'found'), texto: perdido ? 'PERDIDO' : 'ENCONTRADO' }),
      criar('div', { class: 'pet-info' }, [
        criar('h3', { texto: a.nome }),
        criar('p', { texto: `📌 ${a.cidade}, ${a.uf}` }),
        criar('p', { texto: `📅 ${formatarData(a.data)}` }),
      ]),
    ]);

    const abrir = () => { location.href = paginaDetalhe(a); };
    card.addEventListener('click', abrir);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrir(); });
    return card;
  }

  function mostrarVazio(grade, mensagem) {
    grade.appendChild(criar('p', { class: 'estado-vazio' }, [
      mensagem, ' ', criar('a', { href: 'form1.html', texto: 'Cadastrar um animal' }),
    ]));
  }

  async function carregarGrade(grade, consulta) {
    const qs = new URLSearchParams(consulta);
    const r = await api('/animais?' + qs.toString());
    r.itens.forEach((a) => grade.appendChild(criarCard(a)));
    return r;
  }

  /* ----- página inicial ----- */

  function iniciarHome() {
    $$('.pets-grid[data-status]').forEach((grade) => {
      carregarGrade(grade, { status: grade.dataset.status, limite: grade.dataset.limite || 4 })
        .then((r) => { if (!r.itens.length) mostrarVazio(grade, 'Nenhum animal anunciado por enquanto.'); })
        .catch((e) => aviso(e.message, 'erro'));
    });

    const campo = $('#cidadeBusca');
    const ir = (pagina) => {
      const cidade = campo.value.trim();
      if (!cidade) { aviso('Digite uma cidade para realizar a busca.', 'erro'); campo.focus(); return; }
      location.href = pagina + '?cidade=' + encodeURIComponent(cidade);
    };
    // Mesma lógica do script original: PERDI lista os animais "perdidos" da cidade,
    // ENCONTREI lista os "encontrados".
    $('#btnPerdi')?.addEventListener('click', () => ir('mural-procurados.html'));
    $('#btnEncontrei')?.addEventListener('click', () => ir('mural-encontrados.html'));
    campo?.addEventListener('keydown', (e) => { if (e.key === 'Enter') ir('mural-procurados.html'); });
  }

  /* ----- murais (procurados / encontrados) ----- */

  function iniciarMural() {
    const grade = $('#petsGrid');
    const campoCidade = $('#cidadeBusca');
    const painel = $('#filtrosPanel');
    const maisWrapper = $('#carregarMaisWrapper');
    const limite = Number(grade.dataset.limite) || 12;
    let offset = 0;
    let carregando = false;

    const q = params();
    campoCidade.value = q.get('cidade') || '';
    ['especie', 'sexo', 'porte'].forEach((nome) => {
      const valor = q.get(nome);
      if (valor) {
        const r = $(`input[name="${nome}"][value="${CSS.escape(valor)}"]`, painel);
        if (r) r.checked = true;
      }
    });
    $('#filtroCor').value = q.get('cor') || '';
    if (['especie', 'sexo', 'porte', 'cor'].some((k) => q.get(k))) painel.hidden = false;

    function filtrosAtuais() {
      const f = {};
      const cidade = campoCidade.value.trim();
      if (cidade) f.cidade = cidade;
      ['especie', 'sexo', 'porte'].forEach((nome) => {
        const marcado = $(`input[name="${nome}"]:checked`, painel);
        if (marcado) f[nome] = marcado.value;
      });
      const cor = $('#filtroCor').value.trim();
      if (cor) f.cor = cor;
      return f;
    }

    async function buscar(zerar) {
      if (carregando) return;
      carregando = true;
      const filtros = filtrosAtuais();
      if (zerar) { offset = 0; grade.replaceChildren(); history.replaceState(null, '', location.pathname + (Object.keys(filtros).length ? '?' + new URLSearchParams(filtros) : '')); }
      try {
        const r = await carregarGrade(grade, { status: grade.dataset.status, limite, offset, ...filtros });
        offset += r.itens.length;
        if (!r.total) {
          mostrarVazio(grade, Object.keys(filtros).length ? 'Nenhum animal encontrado com esses filtros.' : 'Nenhum animal anunciado por enquanto.');
        }
        maisWrapper.hidden = offset >= r.total;
      } catch (e) {
        aviso(e.message, 'erro');
      } finally {
        carregando = false;
      }
    }

    $('#btnFiltros').addEventListener('click', () => { painel.hidden = !painel.hidden; });
    $('#btnBuscar').addEventListener('click', () => buscar(true));
    $('#btnAplicarFiltros').addEventListener('click', () => buscar(true));
    $('#btnLimparFiltros').addEventListener('click', () => {
      $$('input[type="radio"]', painel).forEach((r) => { r.checked = false; });
      $('#filtroCor').value = '';
      buscar(true);
    });
    $('#btnCarregarMais').addEventListener('click', () => buscar(false));
    campoCidade.addEventListener('keydown', (e) => { if (e.key === 'Enter') buscar(true); });

    buscar(true);
  }

  /* ----------------------------------------------------------
     5. CADASTRO, LOGIN E RECUPERAÇÃO DE SENHA
     ---------------------------------------------------------- */

  function validarCPF(valor) {
    const cpf = String(valor).replace(/\D/g, '');
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    for (let t = 9; t < 11; t++) {
      let soma = 0;
      for (let i = 0; i < t; i++) soma += Number(cpf[i]) * (t + 1 - i);
      if (((soma * 10) % 11) % 10 !== Number(cpf[t])) return false;
    }
    return true;
  }

  function mascararCPF(campo) {
    campo.addEventListener('input', () => {
      const d = campo.value.replace(/\D/g, '').slice(0, 11);
      campo.value = d
        .replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1-$2');
    });
  }

  // Enter em qualquer campo da página dispara o botão principal
  function enterEnvia(campos, botao) {
    campos.forEach((c) => c && c.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); botao.click(); }
    }));
  }

  async function comBotaoOcupado(botao, tarefa) {
    botao.disabled = true;
    try { return await tarefa(); } finally { botao.disabled = false; }
  }

  function iniciarCadastro() {
    const botao = $('#btnRegistrar');
    const campos = ['nome', 'email', 'cpf', 'cidade', 'senha', 'confirmar-senha'].map((id) => $('#' + id));
    mascararCPF($('#cpf'));
    enterEnvia(campos, botao);

    botao.addEventListener('click', () => comBotaoOcupado(botao, async () => {
      const dados = {
        nome: $('#nome').value.trim(),
        email: $('#email').value.trim(),
        cpf: $('#cpf').value.trim(),
        cidade: $('#cidade').value.trim(),
        senha: $('#senha').value,
        confirmarSenha: $('#confirmar-senha').value,
      };

      if (Object.values(dados).some((v) => v === '')) return aviso('Preencha todos os campos.', 'erro');
      if (!validarCPF(dados.cpf)) return aviso('CPF inválido.', 'erro');
      if (dados.senha.length < 8) return aviso('A senha deve ter pelo menos 8 caracteres.', 'erro');
      if (dados.senha !== dados.confirmarSenha) return aviso('As senhas não coincidem.', 'erro');

      try {
        await api('/auth/registrar', { metodo: 'POST', corpo: dados });
        location.href = 'registro.html';
      } catch (e) {
        aviso(e.message, 'erro');
      }
    }));
  }

  function iniciarLogin() {
    const email = $('#loginEmail');
    const senha = $('#loginSenha');
    const botao = $('#teno-button');
    enterEnvia([email, senha], botao);

    botao.addEventListener('click', () => comBotaoOcupado(botao, async () => {
      if (!email.value.trim() || !senha.value) return aviso('Informe e-mail e senha.', 'erro');
      try {
        const r = await api('/auth/login', { metodo: 'POST', corpo: { email: email.value.trim(), senha: senha.value } });
        sessao.entrar(r.token, r.usuario);
        location.href = destinoSeguro(params().get('next'), 'tela-inicial.html');
      } catch (e) {
        aviso(e.message, 'erro');
      }
    }));
  }

  const CHAVE_RESET_EMAIL = 'achepet_reset_email';
  const CHAVE_RESET_TOKEN = 'achepet_reset_token';

  function iniciarEsqueci1() {
    const email = $('#email');
    const botao = $('#btnEnviarCodigo');
    enterEnvia([email], botao);

    botao.addEventListener('click', () => comBotaoOcupado(botao, async () => {
      const valor = email.value.trim();
      if (!valor) return aviso('Digite seu e-mail.', 'erro');
      try {
        await api('/auth/esqueci-senha', { metodo: 'POST', corpo: { email: valor } });
        sessionStorage.setItem(CHAVE_RESET_EMAIL, valor);
        sessionStorage.removeItem(CHAVE_RESET_TOKEN);
        location.href = 'esqueceu-senha2.html';
      } catch (e) {
        aviso(e.message, 'erro');
      }
    }));
  }

  function iniciarEsqueci2() {
    const email = sessionStorage.getItem(CHAVE_RESET_EMAIL);
    if (!email) { location.replace('esqueceu-senha.html'); return; }

    const campo = $('#codigo');
    const confirmar = $('#btnConfirmarCodigo');
    const reenviar = $('#note-button');
    campo.addEventListener('input', () => { campo.value = campo.value.replace(/\D/g, '').slice(0, 6); });
    enterEnvia([campo], confirmar);

    confirmar.addEventListener('click', () => comBotaoOcupado(confirmar, async () => {
      if (campo.value.length !== 6) return aviso('Digite o código de 6 dígitos.', 'erro');
      try {
        const r = await api('/auth/verificar-codigo', { metodo: 'POST', corpo: { email, codigo: campo.value } });
        sessionStorage.setItem(CHAVE_RESET_TOKEN, r.token);
        location.href = 'esqueceu-senha3.html';
      } catch (e) {
        aviso(e.message, 'erro');
      }
    }));

    reenviar.addEventListener('click', () => comBotaoOcupado(reenviar, async () => {
      try {
        await api('/auth/esqueci-senha', { metodo: 'POST', corpo: { email } });
        aviso('Enviamos um novo código para o seu e-mail.', 'sucesso');
      } catch (e) {
        aviso(e.message, 'erro');
      }
    }));
  }

  function iniciarEsqueci3() {
    const email = sessionStorage.getItem(CHAVE_RESET_EMAIL);
    const token = sessionStorage.getItem(CHAVE_RESET_TOKEN);
    if (!email || !token) { location.replace('esqueceu-senha.html'); return; }

    const senha = $('#novaSenha');
    const confirmar = $('#novaSenhaConfirmar');
    const botao = $('#btnNovaSenha');
    enterEnvia([senha, confirmar], botao);

    botao.addEventListener('click', () => comBotaoOcupado(botao, async () => {
      if (senha.value.length < 8) return aviso('A senha deve ter pelo menos 8 caracteres.', 'erro');
      if (senha.value !== confirmar.value) return aviso('As senhas não coincidem.', 'erro');
      try {
        await api('/auth/redefinir-senha', {
          metodo: 'POST',
          corpo: { email, token, senha: senha.value, confirmarSenha: confirmar.value },
        });
        sessionStorage.removeItem(CHAVE_RESET_EMAIL);
        sessionStorage.removeItem(CHAVE_RESET_TOKEN);
        location.href = 'senhatrocada.html';
      } catch (e) {
        aviso(e.message, 'erro');
      }
    }));
  }

  /* ----------------------------------------------------------
     6. CADASTRO DO ANIMAL (form1 → form4)
     Os dados ficam no sessionStorage entre as telas e só vão
     para o servidor no "Finalizar" (form4).
     ---------------------------------------------------------- */

  const CHAVE_ANIMAL = 'achepet_animal';

  const estado = {
    ler() {
      try { return JSON.parse(sessionStorage.getItem(CHAVE_ANIMAL)) || {}; } catch { return {}; }
    },
    salvar(parcial) {
      const novo = { ...estado.ler(), ...parcial };
      try {
        sessionStorage.setItem(CHAVE_ANIMAL, JSON.stringify(novo));
      } catch {
        aviso('Não foi possível guardar os dados (fotos muito pesadas?). Tente com menos fotos.', 'erro');
        return false;
      }
      return true;
    },
    limpar() { sessionStorage.removeItem(CHAVE_ANIMAL); },
  };

  function iniciarForm1() {
    if (!exigirLogin()) return;
    const salvo = estado.ler().status;
    if (salvo) { const r = $(`input[name="status"][value="${salvo}"]`); if (r) r.checked = true; }

    $('#btn-formulario2').addEventListener('click', (e) => {
      e.preventDefault();
      const marcado = $('input[name="status"]:checked');
      if (!marcado) return aviso('Escolha a situação do animal para continuar.', 'erro');
      if (estado.ler().status && estado.ler().status !== marcado.value) {
        // trocou perdido <-> encontrado: mantém os dados já digitados
      }
      estado.salvar({ status: marcado.value });
      location.href = 'form2.html';
    });
  }

  const CAMPOS_FORM2 = ['nome', 'especie', 'idade', 'raca', 'Porte', 'cor', 'caracteristicas', 'cidade', 'uf', 'data'];

  function iniciarForm2() {
    if (!exigirLogin()) return;
    const salvo = estado.ler();
    if (!salvo.status) { location.replace('form1.html'); return; }

    const data = $('#data');
    data.max = hojeISO();
    $('#labelData').textContent = salvo.status === 'perdido' ? 'Data em que sumiu: *' : 'Data em que foi encontrado: *';

    CAMPOS_FORM2.forEach((id) => { const el = $('#' + id); if (el && salvo[id]) el.value = salvo[id]; });
    if (salvo.sexo) { const r = $(`input[name="sexo"][value="${salvo.sexo}"]`); if (r) r.checked = true; }
    if (!$('#cidade').value && sessao.usuario()) $('#cidade').value = sessao.usuario().cidade || '';

    $$('.campo input, .campo select').forEach((el) => el.addEventListener('input', () => el.classList.remove('campo-erro')));

    function coletar() {
      const d = {};
      CAMPOS_FORM2.forEach((id) => { d[id] = ($('#' + id)?.value || '').trim(); });
      d.sexo = $('input[name="sexo"]:checked')?.value || '';
      return d;
    }

    function avancar(e) {
      e.preventDefault();
      const d = coletar();
      $$('.campo-erro').forEach((el) => el.classList.remove('campo-erro'));

      const obrigatorios = [
        ['especie', 'a espécie'], ['cidade', 'a cidade'], ['uf', 'o estado'], ['data', 'a data'],
      ];
      for (const [id, nome] of obrigatorios) {
        if (!d[id]) { $('#' + id).classList.add('campo-erro'); $('#' + id).focus(); return aviso(`Informe ${nome}.`, 'erro'); }
      }
      if (!d.sexo) return aviso('Escolha o sexo do animal.', 'erro');
      if (d.data > hojeISO()) { data.classList.add('campo-erro'); return aviso('A data não pode estar no futuro.', 'erro'); }

      if (estado.salvar(d)) location.href = 'form3.html';
    }

    $('#btn-formulario2').addEventListener('click', avancar);
  }

  // Redimensiona a foto no navegador (economiza envio e espaço)
  function prepararFoto(arquivo) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(jpeg|png|webp)$/.test(arquivo.type)) return reject(new Error('Use fotos JPG, PNG ou WEBP.'));
      const url = URL.createObjectURL(arquivo);
      const img = new Image();
      img.onload = () => {
        const max = 1280;
        const escala = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * escala);
        c.height = Math.round(img.height * escala);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler essa imagem.')); };
      img.src = url;
    });
  }

  function iniciarForm3() {
    if (!exigirLogin()) return;
    if (!estado.ler().status) { location.replace('form1.html'); return; }

    const MAX = 5;
    let fotos = estado.ler().fotos || [];
    const input = $('#foto');
    const area = $('.botao-arquivo');
    const miniaturas = $$('.foto-preview');

    function desenhar() {
      miniaturas.forEach((el, i) => {
        if (fotos[i]) {
          el.classList.add('preenchida');
          el.style.backgroundImage = `url("${fotos[i]}")`;
          el.title = 'Clique no × para remover';
        } else {
          el.classList.remove('preenchida');
          el.style.backgroundImage = '';
          el.title = '';
        }
      });
    }

    async function adicionar(lista) {
      const arquivos = Array.from(lista);
      for (const arq of arquivos) {
        if (fotos.length >= MAX) { aviso(`Máximo de ${MAX} fotos.`, 'erro'); break; }
        try {
          fotos.push(await prepararFoto(arq));
        } catch (e) {
          aviso(e.message, 'erro');
        }
      }
      if (estado.salvar({ fotos })) desenhar();
      else { fotos = estado.ler().fotos || []; desenhar(); }
    }

    input.addEventListener('change', () => { adicionar(input.files); input.value = ''; });

    ['dragenter', 'dragover'].forEach((ev) => area.addEventListener(ev, (e) => { e.preventDefault(); area.classList.add('arrastando'); }));
    ['dragleave', 'drop'].forEach((ev) => area.addEventListener(ev, (e) => { e.preventDefault(); area.classList.remove('arrastando'); }));
    area.addEventListener('drop', (e) => adicionar(e.dataTransfer.files));

    // o "×" é desenhado no canto superior direito da miniatura
    miniaturas.forEach((el, i) => el.addEventListener('click', (e) => {
      if (!fotos[i]) return;
      const r = el.getBoundingClientRect();
      if (e.clientX > r.right - 22 && e.clientY < r.top + 22) {
        fotos.splice(i, 1);
        estado.salvar({ fotos });
        desenhar();
      }
    }));

    $('#btn-formulario2').addEventListener('click', (e) => {
      e.preventDefault();
      if (!fotos.length) return aviso('Envie pelo menos 1 foto do animal.', 'erro');
      location.href = 'form4.html';
    });

    desenhar();
  }

  function iniciarForm4() {
    if (!exigirLogin()) return;
    const d = estado.ler();
    if (!d.status) { location.replace('form1.html'); return; }
    if (!d.especie || !d.fotos || !d.fotos.length) { location.replace(d.especie ? 'form3.html' : 'form2.html'); return; }

    const fotos = $('#resumoFotos');
    d.fotos.forEach((f, i) => fotos.appendChild(criar('img', { src: f, alt: 'Foto ' + (i + 1) })));

    const linhas = [
      ['Situação', d.status === 'perdido' ? 'Procurado (perdido)' : 'Encontrado'],
      ['Nome', d.nome || 'Sem nome'],
      ['Espécie', d.especie],
      ['Idade', d.idade],
      ['Sexo', SEXO[d.sexo]],
      ['Raça', d.raca],
      ['Porte', d.Porte || 'Não especificado'],
      ['Cor', d.cor],
      ['Local', d.cidade && `${d.cidade}, ${d.uf}`],
      [d.status === 'perdido' ? 'Sumiu em' : 'Encontrado em', formatarData(d.data)],
      ['Características', d.caracteristicas],
    ];
    const lista = $('#resumoDados');
    linhas.forEach(([rotulo, valor]) => {
      if (!valor) return;
      lista.appendChild(criar('dt', { texto: rotulo }));
      lista.appendChild(criar('dd', { texto: valor }));
    });

    const botao = $('#btn-formulario2');
    botao.addEventListener('click', async (e) => {
      e.preventDefault();
      if (botao.classList.contains('carregando')) return;
      botao.classList.add('carregando');
      botao.textContent = 'Enviando…';
      try {
        const r = await api('/animais', {
          metodo: 'POST',
          corpo: {
            status: d.status, nome: d.nome, especie: d.especie, idade: d.idade, sexo: d.sexo, raca: d.raca,
            porte: d.Porte, cor: d.cor, caracteristicas: d.caracteristicas,
            cidade: d.cidade, uf: d.uf, data: d.data, fotos: d.fotos,
          },
        });
        estado.limpar();
        aviso('Animal cadastrado com sucesso!', 'sucesso');
        setTimeout(() => { location.href = (d.status === 'perdido' ? 'procurado.html' : 'encontrado.html') + '?id=' + r.id; }, 800);
      } catch (erro) {
        aviso(erro.message, 'erro');
        botao.classList.remove('carregando');
        botao.textContent = 'Finalizar';
      }
    });
  }

  /* ----------------------------------------------------------
     7. PÁGINA DO ANIMAL (procurado.html / encontrado.html)
     ---------------------------------------------------------- */

  function abrirContato(animal) {
    const usuario = sessao.usuario() || {};
    const campoNome = criar('input', { type: 'text', maxlength: '120', value: usuario.nome || '' });
    const campoEmail = criar('input', { type: 'email', maxlength: '160', value: usuario.email || '' });
    const campoTel = criar('input', { type: 'tel', maxlength: '20', placeholder: '(00) 00000-0000' });
    const campoMsg = criar('textarea', {
      maxlength: '1000', placeholder: animal.status === 'perdido'
        ? 'Conte onde e quando você viu o animal...'
        : 'Descreva o seu animal e como podemos confirmar que é ele...'
    });

    const enviar = criar('button', { type: 'button', class: 'filtro-btn filtro-aplicar', texto: 'Enviar mensagem' });
    const cancelar = criar('button', { type: 'button', class: 'filtro-btn filtro-limpar', texto: 'Cancelar' });

    const fundo = criar('div', { class: 'modal-fundo', role: 'dialog', 'aria-modal': 'true' }, [
      criar('div', { class: 'modal-caixa' }, [
        criar('h3', { texto: 'Entrar em contato' }),
        criar('p', { texto: `Sobre: ${animal.nome} (${animal.cidade}, ${animal.uf}). Seu e-mail e telefone serão enviados a quem publicou o anúncio.` }),
        criar('label', { texto: 'Seu nome' }), campoNome,
        criar('label', { texto: 'Seu e-mail' }), campoEmail,
        criar('label', { texto: 'Telefone com DDD (opcional)' }), campoTel,
        criar('label', { texto: 'Mensagem' }), campoMsg,
        criar('div', { class: 'modal-acoes' }, [cancelar, enviar]),
      ]),
    ]);

    const fechar = () => fundo.remove();
    cancelar.addEventListener('click', fechar);
    fundo.addEventListener('click', (e) => { if (e.target === fundo) fechar(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { fechar(); document.removeEventListener('keydown', esc); }
    });

    enviar.addEventListener('click', () => comBotaoOcupado(enviar, async () => {
      try {
        await api(`/animais/${animal.id}/contatos`, {
          metodo: 'POST',
          corpo: { nome: campoNome.value, email: campoEmail.value, telefone: campoTel.value, mensagem: campoMsg.value },
        });
        fechar();
        aviso('Mensagem enviada! Quem publicou o anúncio receberá seu contato.', 'sucesso');
      } catch (e) {
        aviso(e.message, 'erro');
      }
    }));

    document.body.appendChild(fundo);
    campoMsg.focus();
  }

  async function iniciarDetalhe() {
    const id = Number(params().get('id'));
    const principal = $('.detalhe-page');
    if (!id) { location.replace('tela-inicial.html'); return; }

    let a;
    try {
      a = (await api('/animais/' + id));
    } catch (e) {
      $('#animalTitulo').textContent = 'Anúncio não encontrado';
      $('#btnContato').hidden = true;
      $('#animalFoto').hidden = true;
      return aviso(e.message, 'erro');
    }

    // se abriu na página errada (ex.: encontrado.html com um animal perdido), troca de página
    if (a.status !== principal.dataset.tipo) { location.replace(paginaDetalhe(a)); return; }

    document.title = `${a.nome} | AchePet 🐾`;
    const perdido = a.status === 'perdido';

    const status = $('#animalStatus');
    status.textContent = perdido ? 'PERDIDO' : 'ENCONTRADO';
    status.classList.add(perdido ? 'lost' : 'found');

    $('#animalTitulo').textContent = a.nome + (a.idade ? ', ' + a.idade : '');

    // fotos
    const foto = $('#animalFoto');
    imagemComReserva(foto, urlFoto(a.fotos[0]), `Foto de ${a.nome}`);
    const mini = $('#animalMiniaturas');
    if (a.fotos.length > 1) {
      a.fotos.forEach((caminho, i) => {
        const m = imagemComReserva(criar('img', { class: i === 0 ? 'ativa' : '' }), urlFoto(caminho), `Foto ${i + 1}`);
        m.addEventListener('click', () => {
          foto.src = urlFoto(caminho);
          $$('img', mini).forEach((x) => x.classList.remove('ativa'));
          m.classList.add('ativa');
        });
        mini.appendChild(m);
      });
    }

    // dados
    const itens = [
      ['Espécie', a.especie], ['Sexo', SEXO[a.sexo]], ['Raça', a.raca], ['Porte', a.porte], ['Cor', a.cor],
      ['Local', `${a.cidade}, ${a.uf}`],
      [perdido ? 'Sumiu em' : 'Encontrado em', formatarData(a.data)],
      ['Anunciado por', a.publicadoPor],
    ];
    const ul = $('#animalInfo');
    itens.forEach(([rotulo, valor]) => {
      if (!valor) return;
      ul.appendChild(criar('li', {}, [criar('strong', { texto: rotulo + ': ' }), valor]));
    });
    $('#animalDescricao').textContent = a.caracteristicas || '';

    // botão de contato
    const botao = $('#btnContato');
    const aviso2 = $('#detalheAviso');
    if (a.meu) {
      botao.hidden = true;
      aviso2.textContent = 'Este é o seu anúncio. Veja as mensagens recebidas em "Minha conta".';
    } else if (a.resolvido) {
      botao.hidden = true;
      aviso2.textContent = 'Este anúncio foi marcado como resolvido.';
    } else if (!sessao.logado()) {
      botao.href = 'login.html?next=' + encodeURIComponent(paginaAtual() + location.search);
      aviso2.textContent = 'Você precisa entrar na sua conta para enviar uma mensagem.';
    } else {
      botao.addEventListener('click', (e) => { e.preventDefault(); abrirContato(a); });
    }

    if (params().get('novo')) aviso('Anúncio publicado!', 'sucesso');
  }

  /* ----------------------------------------------------------
     8. MINHA CONTA
     ---------------------------------------------------------- */

  async function iniciarConta() {
    if (!exigirLogin()) return;
    const usuario = sessao.usuario();
    if (usuario) $('#contaTitulo').textContent = 'Olá, ' + usuario.nome.split(' ')[0] + '!';

    const abaAnuncios = $('#abaAnuncios');
    const abaMensagens = $('#abaMensagens');

    $$('.conta-aba').forEach((b) => b.addEventListener('click', () => {
      $$('.conta-aba').forEach((x) => x.classList.toggle('ativa', x === b));
      abaAnuncios.hidden = b.dataset.aba !== 'anuncios';
      abaMensagens.hidden = b.dataset.aba !== 'mensagens';
    }));

    function vazio(alvo, texto, link) {
      alvo.replaceChildren(criar('p', { class: 'estado-vazio' }, [texto, ' ', link && criar('a', { href: link[0], texto: link[1] })]));
    }

    async function carregarAnuncios() {
      const r = await api('/meus-animais');
      if (!r.itens.length) return vazio(abaAnuncios, 'Você ainda não cadastrou nenhum animal.', ['form1.html', 'Cadastrar agora']);
      abaAnuncios.replaceChildren(...r.itens.map((a) => {
        const perdido = a.status === 'perdido';
        const resolver = criar('button', { type: 'button', texto: a.resolvido ? 'Reabrir' : (perdido ? 'Já voltou pra casa' : 'Já encontrou o dono') });
        const excluir = criar('button', { type: 'button', class: 'perigo', texto: 'Excluir' });

        resolver.addEventListener('click', async () => {
          try {
            await api('/animais/' + a.id, { metodo: 'PATCH', corpo: { resolvido: !a.resolvido } });
            aviso(a.resolvido ? 'Anúncio reaberto.' : 'Anúncio marcado como resolvido. Que bom!', 'sucesso');
            carregarAnuncios();
          } catch (e) { aviso(e.message, 'erro'); }
        });
        excluir.addEventListener('click', async () => {
          if (!confirm(`Excluir o anúncio de "${a.nome}"? Essa ação não pode ser desfeita.`)) return;
          try {
            await api('/animais/' + a.id, { metodo: 'DELETE' });
            aviso('Anúncio excluído.', 'sucesso');
            carregarAnuncios();
          } catch (e) { aviso(e.message, 'erro'); }
        });

        return criar('div', { class: 'conta-item' + (a.resolvido ? ' resolvido' : '') }, [
          imagemComReserva(criar('img'), urlFoto(a.foto), a.nome),
          criar('div', { class: 'conta-item-info' }, [
            criar('span', { class: 'pet-status ' + (perdido ? 'lost' : 'found'), texto: (perdido ? 'PERDIDO' : 'ENCONTRADO') + (a.resolvido ? ' · RESOLVIDO' : '') }),
            criar('h3', { texto: a.nome }),
            criar('p', { texto: `📌 ${a.cidade}, ${a.uf} · 📅 ${formatarData(a.data)}` }),
            criar('p', { texto: `✉️ ${a.totalContatos} mensagem(ns)` + (a.naoLidos ? ` · ${a.naoLidos} nova(s)` : '') }),
          ]),
          criar('div', { class: 'conta-acoes' }, [
            criar('a', { href: paginaDetalhe(a), texto: 'Ver anúncio' }), resolver, excluir,
          ]),
        ]);
      }));
    }

    async function carregarMensagens() {
      const r = await api('/meus-contatos');
      const novas = r.itens.filter((m) => !m.lido).length;
      const badge = $('#badgeMensagens');
      badge.textContent = novas;
      badge.hidden = !novas;
      if (!r.itens.length) return vazio(abaMensagens, 'Nenhuma mensagem recebida ainda.');

      abaMensagens.replaceChildren(...r.itens.map((m) => {
        const acoes = criar('div', { class: 'conta-acoes' }, [
          criar('a', { href: 'mailto:' + m.email, texto: 'Responder por e-mail' }),
          m.telefone && criar('a', { href: 'tel:' + m.telefone.replace(/[^\d+]/g, ''), texto: 'Ligar' }),
        ]);
        if (!m.lido) {
          const lida = criar('button', { type: 'button', texto: 'Marcar como lida' });
          lida.addEventListener('click', async () => {
            try { await api(`/contatos/${m.id}/lido`, { metodo: 'PATCH', corpo: {} }); carregarMensagens(); }
            catch (e) { aviso(e.message, 'erro'); }
          });
          acoes.appendChild(lida);
        }
        return criar('div', { class: 'conta-item conta-msg' + (m.lido ? '' : ' nao-lida') }, [
          criar('div', { class: 'conta-item-info' }, [
            criar('h3', { texto: `${m.nome} sobre "${m.animalNome}"` }),
            criar('p', { texto: m.mensagem }),
            criar('p', { texto: `${m.email}${m.telefone ? ' · ' + m.telefone : ''} · ${m.criadoEm.slice(0, 16).replace('T', ' ')} (UTC)` }),
          ]),
          acoes,
        ]);
      }));
    }

    try {
      await Promise.all([carregarAnuncios(), carregarMensagens()]);
    } catch (e) {
      aviso(e.message, 'erro');
      if (e.status === 401) setTimeout(() => { location.href = 'login.html?next=meus-animais.html'; }, 1200);
    }
  }

  /* ----------------------------------------------------------
     9. INICIALIZAÇÃO
     ---------------------------------------------------------- */

  const PAGINAS = {
    home: iniciarHome,
    'mural-perdidos': iniciarMural,
    'mural-encontrados': iniciarMural,
    cadastro: iniciarCadastro,
    login: iniciarLogin,
    esqueci1: iniciarEsqueci1,
    esqueci2: iniciarEsqueci2,
    esqueci3: iniciarEsqueci3,
    form1: iniciarForm1,
    form2: iniciarForm2,
    form3: iniciarForm3,
    form4: iniciarForm4,
    detalhe: iniciarDetalhe,
    conta: iniciarConta,
  };

  document.addEventListener('DOMContentLoaded', () => {
    iniciarTema();
    ajustarMenu();
    iniciarCabecalho();
    const iniciar = PAGINAS[document.body.dataset.page];
    if (iniciar) iniciar();
  });
})();

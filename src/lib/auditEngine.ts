import { WebsiteAuditReport, AuditCheckItem } from '../types/audit.js';

/**
 * Normaliza e sanitiza a URL fornecida
 */
export function sanitizeUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
}

/**
 * O site do lead vem de fora (importação, formulário, ZIP). Buscá-lo a partir do servidor
 * significa que esse texto escolhe o destino da requisição: apontado para `localhost`,
 * `169.254.169.254` ou um IP interno, o servidor faria a chamada por dentro da rede e
 * devolveria a resposta na tela (SSRF). Aqui só passa http(s) para host público.
 */
const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /\.localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^169\.254\./,
  /^::1$/,
  /^\[?::1\]?$/,
  /^f[cd][0-9a-f]{2}:/i,
  /\.internal$/i,
  /\.local$/i,
  /^metadata\./i
];

export function isPubliclyFetchableUrl(rawUrl: string): { ok: boolean; reason?: string } {
  const candidate = sanitizeUrl(rawUrl);
  if (!candidate) return { ok: false, reason: 'URL vazia.' };
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, reason: 'URL inválida.' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'Só http e https são permitidos.' };
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (!host || !host.includes('.') && !host.includes(':')) {
    return { ok: false, reason: 'Host sem domínio público.' };
  }
  if (BLOCKED_HOST_PATTERNS.some(p => p.test(host))) {
    return { ok: false, reason: 'Endereço interno ou local não é permitido.' };
  }
  return { ok: true };
}

/**
 * Executa auditoria 100% matemática, determinística e instantânea
 * no site antigo do lead sem utilizar inteligência artificial.
 */
export async function performWebsiteAudit(leadId: string, leadName: string, websiteUrl?: string): Promise<WebsiteAuditReport> {
  const now = new Date().toISOString();

  // Caso o cliente não tenha site antigo
  if (!websiteUrl || !websiteUrl.trim()) {
    return createNoWebsiteAuditReport(leadId, leadName, now);
  }

  const targetUrl = sanitizeUrl(websiteUrl);
  const reachable = isPubliclyFetchableUrl(targetUrl);
  if (!reachable.ok) {
    return createNoWebsiteAuditReport(leadId, leadName, now);
  }
  let html = '';
  let responseTimeMs = 0;
  let hasHttps = targetUrl.startsWith('https://');
  let finalStatus = 0;
  let serverHeader = '';
  let contentType = '';

  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout max

    // Redirecionamento conferido salto a salto: um site público pode redirecionar para um
    // endereço interno, e com `redirect: 'follow'` o servidor seguiria sem checar.
    let currentUrl = targetUrl;
    let res = await fetch(currentUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 (NyrohAuditEngine/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      redirect: 'manual'
    });
    for (let hop = 0; hop < 3 && res.status >= 300 && res.status < 400; hop++) {
      const location = res.headers.get('location');
      if (!location) break;
      const nextUrl = new URL(location, currentUrl).toString();
      if (!isPubliclyFetchableUrl(nextUrl).ok) break;
      currentUrl = nextUrl;
      res = await fetch(currentUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (NyrohAuditEngine/1.0)' },
        redirect: 'manual'
      });
    }

    clearTimeout(timeoutId);
    responseTimeMs = Date.now() - startTime;
    finalStatus = res.status;
    serverHeader = res.headers.get('server') || '';
    contentType = res.headers.get('content-type') || '';

    // Verifica se a URL final redirecionada é HTTPS
    if (res.url && res.url.startsWith('https://')) {
      hasHttps = true;
    }

    if (res.ok || (res.status >= 200 && res.status < 400)) {
      html = await res.text();
    } else {
      html = '';
    }
  } catch (err: any) {
    responseTimeMs = Date.now() - startTime;
    // Se falhar com https, tenta uma vez rápida com http se não tinha especificado
    if (targetUrl.startsWith('https://')) {
      try {
        const httpUrl = targetUrl.replace(/^https:\/\//i, 'http://');
        const controller2 = new AbortController();
        const timeout2 = setTimeout(() => controller2.abort(), 4000);
        const res2 = await fetch(httpUrl, {
          signal: controller2.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36 (NyrohAuditEngine/1.0)'
          }
        });
        clearTimeout(timeout2);
        if (res2.ok) {
          html = await res2.text();
          hasHttps = false; // falhou em https, mas abriu em http inseguro
          finalStatus = res2.status;
        }
      } catch (e2) {
        // Site inacessível ou fora do ar
      }
    }
  }

  // Se o site não retornou nada ou deu erro de conexão
  if (!html) {
    return createBrokenWebsiteAuditReport(leadId, leadName, targetUrl, responseTimeMs, now);
  }

  // -------------------------------------------------------------
  // ANÁLISE CIRÚRGICA DE HTML (Regex nativa de alta velocidade)
  // -------------------------------------------------------------
  const lowerHtml = html.toLowerCase();

  // 1. WhatsApp
  const hasWhatsApp = /wa\.me|api\.whatsapp\.com|whatsapp:\/\//i.test(html);

  // 2. Telefone clicável (tel:)
  const hasTelLinks = /href=["']tel:[^"']+["']/i.test(html);

  // 3. Viewport (Responsividade Mobile)
  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);

  // 4. H1
  const h1Matches = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) || [];
  const h1Count = h1Matches.length;
  let h1Text = '';
  if (h1Count > 0) {
    h1Text = h1Matches[0].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
  }

  // 5. Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const titleText = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ') : '';
  const titleLength = titleText.length;

  // 6. Meta Description
  const metaDescMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
                        html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const metaDescription = metaDescMatch ? metaDescMatch[1].trim() : '';
  const hasMetaDescription = !!metaDescription;

  // 7. Imagens e Alt Tags
  const imgTags = html.match(/<img[^>]+>/gi) || [];
  const totalImagesCount = imgTags.length;
  let imagesWithoutAltCount = 0;
  for (const img of imgTags) {
    if (!/alt=["'][^"']+["']/i.test(img)) {
      imagesWithoutAltCount++;
    }
  }

  // 8. OpenGraph
  const hasOpenGraph = /<meta[^>]+property=["']og:(image|title)["']/i.test(html);

  // 9. Detecção de CMS / Tecnologias defasadas
  let cmsDetected = '';
  if (/wp-content|wp-includes/i.test(html)) cmsDetected = 'WordPress Legado';
  else if (/wix\.com|wixsite\.com/i.test(html)) cmsDetected = 'Wix Básico';
  else if (/joomla/i.test(html)) cmsDetected = 'Joomla Antigo';
  else if (/bootstrap/i.test(html)) cmsDetected = 'HTML / Bootstrap';

  // -------------------------------------------------------------
  // CÁLCULO DOS 4 PILARES DE SCORE (0 a 100)
  // -------------------------------------------------------------
  const checks: AuditCheckItem[] = [];

  // --- PILAR 1: DESEMPENHO & VELOCIDADE (0 a 100) ---
  let perfScore = 100;
  if (responseTimeMs > 2500) {
    perfScore -= 45;
    checks.push({
      id: 'perf-slow-server',
      title: 'Tempo de Resposta do Servidor Lento',
      category: 'performance',
      status: 'fail',
      scoreImpact: -45,
      observedValue: `${(responseTimeMs / 1000).toFixed(1)}s para resposta inicial`,
      recommendation: 'A resposta deve ser inferior a 1.0s para evitar abandono imediato.',
      salesPitch: 'O site atual demora mais de 2.5s só para começar a carregar. Mais de 40% dos visitantes fecham a aba antes mesmo de ver a empresa.'
    });
  } else if (responseTimeMs > 1500) {
    perfScore -= 20;
    checks.push({
      id: 'perf-med-server',
      title: 'Velocidade de Carregamento Mediana',
      category: 'performance',
      status: 'warning',
      scoreImpact: -20,
      observedValue: `${(responseTimeMs / 1000).toFixed(1)}s`,
      recommendation: 'Migrar para infraestrutura moderna com CDN de borda.',
      salesPitch: 'O site tem carregamento mediano, gerando atrito no celular.'
    });
  } else {
    checks.push({
      id: 'perf-fast-server',
      title: 'Tempo de Resposta Estável',
      category: 'performance',
      status: 'pass',
      scoreImpact: 0,
      observedValue: `${(responseTimeMs / 1000).toFixed(1)}s`,
      recommendation: 'Manter arquitetura leve.',
      salesPitch: 'Tempo de servidor aceitável, mas requer otimização no novo padrão.'
    });
  }

  // --- PILAR 2: CONVERSÃO & WHATSAPP NO CELULAR (0 a 100) ---
  let convScore = 100;
  if (!hasWhatsApp) {
    convScore -= 40;
    checks.push({
      id: 'conv-no-whatsapp',
      title: 'Ausência de Botão de WhatsApp Direto',
      category: 'conversion',
      status: 'fail',
      scoreImpact: -40,
      observedValue: 'Nenhum link oficial do WhatsApp detectado na página inicial',
      recommendation: 'Integrar botão flutuante e chamadas de ação para WhatsApp em 1 clique.',
      salesPitch: 'O cliente não tem como mandar mensagem imediata pelo WhatsApp. Ele precisa copiar o número, salvar na agenda ou desiste na hora.'
    });
  } else {
    checks.push({
      id: 'conv-has-whatsapp',
      title: 'Link de WhatsApp Detectado',
      category: 'conversion',
      status: 'pass',
      scoreImpact: 0,
      observedValue: 'Link de WhatsApp encontrado',
      recommendation: 'Certificar-se de que a mensagem inicial é pré-configurada para conversão.',
      salesPitch: 'Possui link de WhatsApp, mas o modelo Nyroh inclui botão flutuante com mensagem pré-formatada.'
    });
  }

  if (!hasTelLinks) {
    convScore -= 25;
    checks.push({
      id: 'conv-no-tel-links',
      title: 'Telefone Não Clicável no Smartphone',
      category: 'conversion',
      status: 'fail',
      scoreImpact: -25,
      observedValue: 'Sem tags tel: para discagem direta no celular',
      recommendation: 'Todos os números devem permitir ligar com 1 toque no celular.',
      salesPitch: 'Quem acessa pelo celular não consegue tocar no número para ligar. O cliente tem que memorizar o número para discar.'
    });
  }

  if (!hasViewport) {
    convScore -= 35;
    checks.push({
      id: 'conv-no-viewport',
      title: 'Site Não Adaptado para Celular (Sem Viewport)',
      category: 'conversion',
      status: 'fail',
      scoreImpact: -35,
      observedValue: 'Falta meta viewport responsivo para smartphone',
      recommendation: 'Implementar arquitetura 100% mobile-first com botões ergonômicos.',
      salesPitch: 'O site fica minúsculo no celular, obrigando o cliente a dar zoom com dois dedos para conseguir ler o texto.'
    });
  }

  // --- PILAR 3: SEO & GOOGLE LOCAL (0 a 100) ---
  let seoScore = 100;

  // H1 Check
  if (h1Count === 0) {
    seoScore -= 25;
    checks.push({
      id: 'seo-no-h1',
      title: 'Falta de Tag H1 Principal no Google',
      category: 'seo',
      status: 'fail',
      scoreImpact: -25,
      observedValue: '0 títulos H1 encontrados na página',
      recommendation: 'Definir exatamente 1 H1 com a atividade principal e a cidade de atuação.',
      salesPitch: 'O Google não sabe qual é a principal especialidade da empresa porque a página não tem título H1 de busca.'
    });
  } else if (/bem-vindo|home|início|inicio|sobre|site/i.test(h1Text)) {
    seoScore -= 20;
    checks.push({
      id: 'seo-weak-h1',
      title: 'Título H1 Genérico (Sem Palavra-Chave)',
      category: 'seo',
      status: 'warning',
      scoreImpact: -20,
      observedValue: `"${h1Text.substring(0, 45)}"`,
      recommendation: 'Substituir por palavras com alta busca na sua região (Ex: "Vidraçaria em São Paulo").',
      salesPitch: `O título principal do site está como "${h1Text.substring(0, 30)}", o que é invisível para quem busca o serviço no Google.`
    });
  } else {
    checks.push({
      id: 'seo-good-h1',
      title: 'Tag H1 Configurada',
      category: 'seo',
      status: 'pass',
      scoreImpact: 0,
      observedValue: `H1 detectado: "${h1Text.substring(0, 35)}..."`,
      recommendation: 'Manter títulos otimizados para busca local.',
      salesPitch: 'Possui título H1 estruturado.'
    });
  }

  // Title Check
  if (titleLength < 10) {
    seoScore -= 20;
    checks.push({
      id: 'seo-short-title',
      title: 'Título de Busca Vazio ou Muito Curto',
      category: 'seo',
      status: 'fail',
      scoreImpact: -20,
      observedValue: `Título tem apenas ${titleLength} caracteres ("${titleText}")`,
      recommendation: 'Criar título descritivo entre 40 e 60 caracteres com nome e especialidade.',
      salesPitch: 'O título que aparece no Google é curto demais, não aproveitando o espaço da busca para destacar a empresa.'
    });
  }

  // Meta Description
  if (!hasMetaDescription) {
    seoScore -= 25;
    checks.push({
      id: 'seo-no-meta-desc',
      title: 'Ausência de Meta Descrição no Google',
      category: 'seo',
      status: 'fail',
      scoreImpact: -25,
      observedValue: 'Nenhum resumo configurado na tag description',
      recommendation: 'Escrever texto persuasivo de 140 a 160 caracteres com chamada para ação.',
      salesPitch: 'Nas buscas do Google, em vez de um texto bonito e chamativo, o Google puxa frases soltas aleatórias da página.'
    });
  }

  // Imagens sem alt
  if (imagesWithoutAltCount > 0) {
    const penalty = Math.min(20, imagesWithoutAltCount * 4);
    seoScore -= penalty;
    checks.push({
      id: 'seo-missing-alt',
      title: 'Imagens Sem Identificação para o Google',
      category: 'seo',
      status: 'warning',
      scoreImpact: -penalty,
      observedValue: `${imagesWithoutAltCount} de ${totalImagesCount} imagens sem tag alt`,
      recommendation: 'Adicionar descrição textual das fotos e serviços realizados.',
      salesPitch: `Existem ${imagesWithoutAltCount} fotos no site que o Google não consegue indexar porque não têm texto alternativo descritivo.`
    });
  }

  // OpenGraph
  if (!hasOpenGraph) {
    seoScore -= 10;
    checks.push({
      id: 'seo-no-og',
      title: 'Pré-Visualização Incompleta no WhatsApp',
      category: 'seo',
      status: 'warning',
      scoreImpact: -10,
      observedValue: 'Tags OpenGraph de compartilhamento ausentes',
      recommendation: 'Configurar imagem e título de destaque para links enviados no WhatsApp.',
      salesPitch: 'Ao enviar o link do site no WhatsApp para um cliente, não carrega a foto oficial da empresa nem a prévia profissional.'
    });
  }

  // --- PILAR 4: SEGURANÇA & INFRAESTRUTURA (0 a 100) ---
  let secScore = 100;
  if (!hasHttps) {
    secScore -= 50;
    checks.push({
      id: 'sec-no-https',
      title: 'Sem Certificado de Segurança SSL (HTTPS)',
      category: 'security',
      status: 'fail',
      scoreImpact: -50,
      observedValue: 'Conexão insegura http:// sem criptografia',
      recommendation: 'Instalar e forçar certificado SSL em todas as requisições.',
      salesPitch: 'O Google Chrome avisa "Não Seguro" em vermelho para os clientes que abrem o site, transmitindo falta de profissionalismo e risco.'
    });
  } else {
    checks.push({
      id: 'sec-has-https',
      title: 'Certificado SSL (HTTPS) Ativo',
      category: 'security',
      status: 'pass',
      scoreImpact: 0,
      observedValue: 'Conexão criptografada https:// ativa',
      recommendation: 'Manter renovação automática do certificado.',
      salesPitch: 'Possui cadeado de segurança.'
    });
  }

  // Normaliza notas entre 0 e 100
  perfScore = Math.max(10, Math.min(100, Math.round(perfScore)));
  convScore = Math.max(10, Math.min(100, Math.round(convScore)));
  seoScore = Math.max(10, Math.min(100, Math.round(seoScore)));
  secScore = Math.max(10, Math.min(100, Math.round(secScore)));

  // Score Geral Ponderado (Conversão tem peso maior para vendas)
  const overallScore = Math.round(
    convScore * 0.35 +
    seoScore * 0.30 +
    perfScore * 0.20 +
    secScore * 0.15
  );

  return {
    leadId,
    leadName,
    analyzedUrl: targetUrl,
    hasWebsite: true,
    timestamp: now,
    overallScore,
    scores: {
      performance: perfScore,
      seo: seoScore,
      conversion: convScore,
      security: secScore
    },
    metrics: {
      responseTimeMs,
      hasHttps,
      hasViewport,
      hasWhatsApp,
      hasTelLinks,
      h1Text,
      h1Count,
      titleText,
      titleLength,
      metaDescription,
      hasMetaDescription,
      imagesWithoutAltCount,
      totalImagesCount,
      hasOpenGraph,
      serverHeader,
      cmsDetected
    },
    checks,
    nyrohComparison: {
      currentScore: overallScore,
      nyrohScore: 98,
      highlights: [
        { label: 'Conversão no WhatsApp', current: hasWhatsApp ? 'Link simples' : 'Inexistente ❌', nyroh: 'Botão Flutuante + Mensagem Pronta ⚡' },
        { label: 'Acesso pelo Celular', current: hasViewport ? 'Médio' : 'Desconfigurado ❌', nyroh: '100% Mobile First Fluido 📱' },
        { label: 'Otimização no Google', current: `${seoScore}/100`, nyroh: 'SEO Local Blindado 🚀' },
        { label: 'Velocidade de Abertura', current: `${(responseTimeMs / 1000).toFixed(1)}s`, nyroh: 'Abaixo de 0.6s (Instantâneo) ⚡' }
      ]
    }
  };
}

/**
 * Gera relatório quando o cliente NÃO TEM site cadastrado
 */
function createNoWebsiteAuditReport(leadId: string, leadName: string, now: string): WebsiteAuditReport {
  return {
    leadId,
    leadName,
    analyzedUrl: '(Nenhum site cadastrado)',
    hasWebsite: false,
    timestamp: now,
    overallScore: 18,
    scores: {
      performance: 15,
      seo: 10,
      conversion: 20,
      security: 30
    },
    metrics: {
      responseTimeMs: 0,
      hasHttps: false,
      hasViewport: false,
      hasWhatsApp: false,
      hasTelLinks: false,
      h1Count: 0,
      titleLength: 0,
      hasMetaDescription: false,
      imagesWithoutAltCount: 0,
      totalImagesCount: 0,
      hasOpenGraph: false
    },
    checks: [
      {
        id: 'no-web-pres',
        title: 'Invisibilidade Digital Total na Região',
        category: 'seo',
        status: 'fail',
        scoreImpact: -60,
        observedValue: 'Sem endereço web próprio',
        recommendation: 'Publicar página profissional moderna com domínio próprio.',
        salesPitch: 'Quem pesquisa pelo seu serviço no Google não encontra você; todo o faturamento da sua região está indo direto para concorrentes que têm site.'
      },
      {
        id: 'no-web-conv',
        title: 'Perda Diária de Orçamentos no WhatsApp',
        category: 'conversion',
        status: 'fail',
        scoreImpact: -50,
        observedValue: 'Sem canal de captura automatizada',
        recommendation: 'Ter um site ativo para direcionar tráfego direto para o WhatsApp dos vendedores.',
        salesPitch: 'Sem um site, a empresa não tem como rodar anúncios ou passar credibilidade para clientes que buscam no celular.'
      }
    ],
    nyrohComparison: {
      currentScore: 18,
      nyrohScore: 98,
      highlights: [
        { label: 'Presença no Google', current: 'Invisível ❌', nyroh: '1ª Página no Google Local 🚀' },
        { label: 'Canal de WhatsApp', current: 'Apenas boca a boca', nyroh: 'Disparo direto em 1 clique 💬' },
        { label: 'Credibilidade da Marca', current: 'Sem portfólio online', nyroh: 'Página de Alta Tecnologia 💎' },
        { label: 'Tempo de Implementação', current: 'Atrasado', nyroh: 'Publicação Imediata Hoje ⚡' }
      ]
    }
  };
}

/**
 * Gera relatório quando o site existe mas está fora do ar ou quebrado
 */
function createBrokenWebsiteAuditReport(leadId: string, leadName: string, targetUrl: string, responseTimeMs: number, now: string): WebsiteAuditReport {
  return {
    leadId,
    leadName,
    analyzedUrl: targetUrl,
    hasWebsite: true,
    timestamp: now,
    overallScore: 22,
    scores: {
      performance: 15,
      seo: 20,
      conversion: 15,
      security: 25
    },
    metrics: {
      responseTimeMs,
      hasHttps: targetUrl.startsWith('https://'),
      hasViewport: false,
      hasWhatsApp: false,
      hasTelLinks: false,
      h1Count: 0,
      titleLength: 0,
      hasMetaDescription: false,
      imagesWithoutAltCount: 0,
      totalImagesCount: 0,
      hasOpenGraph: false
    },
    checks: [
      {
        id: 'broken-offline',
        title: 'Site Fora do Ar ou com Falha de Conexão',
        category: 'performance',
        status: 'fail',
        scoreImpact: -80,
        observedValue: 'Servidor inacessível ou tempo limite esgotado',
        recommendation: 'Migrar imediatamente para hospedagem estável.',
        salesPitch: 'O seu site atual está instável ou fora do ar. Clientes que tentam abrir sua página encontram uma mensagem de erro.'
      }
    ],
    nyrohComparison: {
      currentScore: 22,
      nyrohScore: 98,
      highlights: [
        { label: 'Disponibilidade do Site', current: 'Instável / Fora do Ar ❌', nyroh: '99.9% Uptime em Nuvem ☁️' },
        { label: 'Velocidade de Carregamento', current: 'Erro de Conexão', nyroh: '0.6s Instantâneo ⚡' },
        { label: 'Segurança SSL', current: 'Instável', nyroh: 'Certificado Blindado Grátis 🔒' }
      ]
    }
  };
}

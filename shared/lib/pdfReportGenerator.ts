import { jsPDF } from 'jspdf';
import { WebsiteAuditReport } from '../types/audit';

/**
 * Gerador de Laudo Técnico Executivo de Auditoria em PDF
 * Desenvolvido com alta fidelidade visual, métricas claras e argumentos de fechamento imediato.
 */
export function generateAuditPdf(report: WebsiteAuditReport, sellerName: string = 'Especialista Comercial Nyroh'): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const margin = 14;
  const contentWidth = pageWidth - (margin * 2); // 182mm

  // -------------------------------------------------------------
  // 1. CABEÇALHO EXECUTIVO (Navy Escuro com Linha de Assinatura Azul)
  // -------------------------------------------------------------
  doc.setFillColor(10, 17, 40); // #0a1128 navy profundo
  doc.rect(0, 0, pageWidth, 40, 'F');

  // Gradiente simulado com faixas de destaque
  doc.setFillColor(37, 99, 235); // #2563eb royal blue
  doc.rect(0, 40, pageWidth, 2, 'F');
  doc.setFillColor(56, 189, 248); // #38bdf8 cyan accent
  doc.rect(0, 42, 60, 1, 'F');

  // Tag Superior de Certificação
  doc.setFillColor(30, 58, 138); // blue-900
  doc.roundedRect(margin, 9, 58, 5.5, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(191, 219, 254); // blue-200
  doc.text('AUDITORIA TÉCNICA OFICIAL', margin + 3, 13);

  // Selo Lateral Direito
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(248, 250, 252);
  doc.text('PADRÃO NYROH ENTERPRISE', pageWidth - margin - 52, 13);

  // Título Principal
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text('DIAGNÓSTICO TÉCNICO DE PERFORMANCE & CONVERSÃO', margin, 22);

  // Subtítulo
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text('Inspeção algorítmica de velocidade, SEO local, retenção mobile e canal de vendas', margin, 28);

  // Metadados do Laudo (Data, Responsável e Protocolo)
  const formattedDate = new Date(report.timestamp).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  const auditProtocol = `NYR-${Math.abs(report.leadId.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)).toString(16).toUpperCase().slice(0, 8)}`;

  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(`Emissão: ${formattedDate}  |  Especialista: ${sellerName}  |  Protocolo: ${auditProtocol}`, margin, 35);

  // -------------------------------------------------------------
  // 2. CARD DE IDENTIFICAÇÃO DA EMPRESA AUDITADA
  // -------------------------------------------------------------
  let curY = 47;
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, curY, contentWidth, 18, 2, 2, 'FD');

  // Nome do Cliente
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  const cleanLeadName = report.leadName.length > 50 ? `${report.leadName.substring(0, 47)}...` : report.leadName;
  doc.text(`Empresa Analisada: ${cleanLeadName}`, margin + 5, curY + 6.5);

  // URL e Status
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  const cleanUrl = report.analyzedUrl.length > 60 ? `${report.analyzedUrl.substring(0, 57)}...` : report.analyzedUrl;
  doc.text(`Endereço Inspecionado: ${cleanUrl}`, margin + 5, curY + 12.5);

  // Tag do Tempo de Resposta
  const responseTimeStr = report.metrics.responseTimeMs ? `${(report.metrics.responseTimeMs / 1000).toFixed(2)}s` : 'N/D';
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(pageWidth - margin - 48, curY + 4, 43, 10, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('TEMPO DE RESPOSTA', pageWidth - margin - 45, curY + 8);
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(responseTimeStr, pageWidth - margin - 45, curY + 12.5);

  // -------------------------------------------------------------
  // 3. SCORE GERAL & TERMÔMETRO DE SAÚDE DIGITAL
  // -------------------------------------------------------------
  curY += 22;
  const isCritical = report.overallScore < 50;
  const isWarning = report.overallScore >= 50 && report.overallScore < 75;

  if (isCritical) {
    doc.setFillColor(254, 242, 242); // rose-50
    doc.setDrawColor(254, 202, 202); // rose-200
  } else if (isWarning) {
    doc.setFillColor(254, 249, 195); // yellow-100
    doc.setDrawColor(253, 224, 71); // yellow-300
  } else {
    doc.setFillColor(240, 253, 244); // emerald-50
    doc.setDrawColor(187, 247, 208); // emerald-200
  }
  doc.roundedRect(margin, curY, contentWidth, 26, 2.5, 2.5, 'FD');

  // Nota Gigante
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  if (isCritical) doc.setTextColor(225, 29, 72); // rose-600
  else if (isWarning) doc.setTextColor(202, 138, 4); // amber-600
  else doc.setTextColor(16, 185, 129); // emerald-600
  doc.text(`${report.overallScore}`, margin + 7, curY + 18);

  doc.setFontSize(11);
  doc.setTextColor(148, 163, 184);
  doc.text('/100', margin + 27, curY + 18);

  // Status Diagnóstico
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  const statusTitle = isCritical
    ? 'ÍNDICE DE SAÚDE DIGITAL: CRÍTICO (ALTO RISCO DE PERDA DE VENDAS)'
    : isWarning
      ? 'ÍNDICE DE SAÚDE DIGITAL: MODERADO (GARGALOS IDENTIFICADOS)'
      : 'ÍNDICE DE SAÚDE DIGITAL: ESTÁVEL (PONTOS DE OTIMIZAÇÃO)';
  doc.text(statusTitle, margin + 42, curY + 9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(71, 85, 105);
  const statusDesc = isCritical
    ? 'O site atual apresenta falhas estruturais graves. Visitantes desistem antes da página carregar ou não conseguem falar facilmente via WhatsApp.'
    : isWarning
      ? 'A estrutura atual perde visitantes para concorrentes locais devido a tempo de resposta elevado e falta de gatilhos imediatos de conversão.'
      : 'A estrutura possui base funcional, porém carece de velocidade ultra-otimizada e integração comercial moderna.';
  const splitStatusDesc = doc.splitTextToSize(statusDesc, contentWidth - 48);
  doc.text(splitStatusDesc, margin + 42, curY + 15);

  // Barra de Progresso Visual (Gauge Horizontal)
  const barWidth = contentWidth - 48;
  const barY = curY + 21.5;
  doc.setFillColor(226, 232, 240); // fundo cinza
  doc.roundedRect(margin + 42, barY, barWidth, 2.5, 1, 1, 'F');
  
  const filledWidth = Math.max(4, Math.min(barWidth, (barWidth * report.overallScore) / 100));
  if (isCritical) doc.setFillColor(225, 29, 72);
  else if (isWarning) doc.setFillColor(202, 138, 4);
  else doc.setFillColor(16, 185, 129);
  doc.roundedRect(margin + 42, barY, filledWidth, 2.5, 1, 1, 'F');

  // -------------------------------------------------------------
  // 4. OS 4 PILARES DA ENGENHARIA DIGITAL (Com Mini-Barras)
  // -------------------------------------------------------------
  curY += 30;
  const pillarGap = 3;
  const pillarWidth = (contentWidth - (pillarGap * 3)) / 4;

  const pillars = [
    { label: 'CONVERSÃO', score: report.scores.conversion, sub: 'WhatsApp & Ação' },
    { label: 'SEO LOCAL', score: report.scores.seo, sub: 'Busca Google' },
    { label: 'VELOCIDADE', score: report.scores.performance, sub: 'Tempo de Resposta' },
    { label: 'SEGURANÇA', score: report.scores.security, sub: 'Criptografia SSL' }
  ];

  pillars.forEach((p, idx) => {
    const pX = margin + idx * (pillarWidth + pillarGap);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(pX, curY, pillarWidth, 24, 2, 2, 'FD');

    // Título do Pilar
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(p.label, pX + 4, curY + 6);

    // Score Numérico
    doc.setFontSize(13);
    if (p.score < 50) doc.setTextColor(225, 29, 72);
    else if (p.score < 75) doc.setTextColor(217, 119, 6);
    else doc.setTextColor(16, 185, 129);
    doc.text(`${p.score}%`, pX + 4, curY + 13.5);

    // Mini barra de progresso
    const pBarWidth = pillarWidth - 8;
    const pBarY = curY + 16;
    doc.setFillColor(241, 245, 249);
    doc.rect(pX + 4, pBarY, pBarWidth, 1.8, 'F');
    const pFilled = Math.max(1, (pBarWidth * p.score) / 100);
    if (p.score < 50) doc.setFillColor(225, 29, 72);
    else if (p.score < 75) doc.setFillColor(217, 119, 6);
    else doc.setFillColor(16, 185, 129);
    doc.rect(pX + 4, pBarY, pFilled, 1.8, 'F');

    // Subtítulo
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(p.sub, pX + 4, curY + 21);
  });

  // -------------------------------------------------------------
  // 5. GARGALOS DETECTADOS NO SITE ATUAL (Evidências Concretas)
  // -------------------------------------------------------------
  curY += 28;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('1. GARGALOS TÉCNICOS DIAGNOSTICADOS NO SITE ATUAL', margin, curY);

  curY += 4;
  // Pega até 3 gargalos críticos ou avisos para manter o layout perfeito e sem overflow
  const relevantChecks = report.checks
    .filter(c => c.status === 'fail' || c.status === 'warning')
    .slice(0, 3);

  // Se não houver falhas, pega os 2 primeiros
  const checksToDisplay = relevantChecks.length > 0 ? relevantChecks : report.checks.slice(0, 2);

  checksToDisplay.forEach((chk) => {
    const isFail = chk.status === 'fail';
    doc.setFillColor(isFail ? 255 : 255, isFail ? 245 : 251, isFail ? 245 : 235);
    doc.setDrawColor(isFail ? 254 : 253, isFail ? 205 : 230, isFail ? 211 : 138);
    doc.setLineWidth(0.25);
    doc.roundedRect(margin, curY, contentWidth, 17, 1.8, 1.8, 'FD');

    // Badge de status
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    if (isFail) {
      doc.setTextColor(190, 18, 60);
      doc.text(`[FALHA DETECTADA] ${chk.title.toUpperCase()}`, margin + 4, curY + 5.5);
    } else {
      doc.setTextColor(180, 83, 9);
      doc.text(`[ALERTA DE RETENÇÃO] ${chk.title.toUpperCase()}`, margin + 4, curY + 5.5);
    }

    // Valor observado à direita
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    const cleanObserved = chk.observedValue.length > 40 ? `${chk.observedValue.substring(0, 37)}...` : chk.observedValue;
    doc.text(`Detectado: ${cleanObserved}`, pageWidth - margin - 4 - doc.getTextWidth(`Detectado: ${cleanObserved}`), curY + 5.5);

    // Texto de impacto comercial
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(51, 65, 85);
    const impactText = `Impacto no Faturamento: ${chk.salesPitch}`;
    const splitImpact = doc.splitTextToSize(impactText, contentWidth - 8);
    doc.text(splitImpact.slice(0, 2), margin + 4, curY + 10.5);

    curY += 19.5;
  });

  // -------------------------------------------------------------
  // 6. PLANO DE MODERNIZAÇÃO: SITE ATUAL VS. PADRÃO NYROH
  // -------------------------------------------------------------
  curY += 1;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('2. PLANO DE ATUALIZAÇÃO & GANHO IMEDIATO (PADRÃO NYROH)', margin, curY);

  curY += 4;
  // Cabeçalho da Tabela
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(margin, curY, contentWidth, 6.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text('ITEM TÉCNICO', margin + 3, curY + 4.5);
  doc.text('SITUAÇÃO NO SITE ATUAL (GARGALO)', margin + 55, curY + 4.5);
  doc.text('NOVA ESTRUTURA NYROH (UPGRADE)', margin + 115, curY + 4.5);

  curY += 6.5;

  // Itens da Tabela (até 5 itens principais)
  const comparisonItems = report.nyrohComparison.highlights.slice(0, 5);
  comparisonItems.forEach((h, i) => {
    const isEven = i % 2 === 0;
    doc.setFillColor(isEven ? 255 : 248, isEven ? 255 : 250, isEven ? 255 : 252);
    doc.rect(margin, curY, contentWidth, 6.8, 'F');

    // Borda inferior sutil
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.2);
    doc.line(margin, curY + 6.8, margin + contentWidth, curY + 6.8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(30, 41, 59);
    doc.text(h.label, margin + 3, curY + 4.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(190, 18, 60);
    const cleanCurrent = h.current.length > 38 ? `${h.current.substring(0, 35)}...` : h.current;
    doc.text(cleanCurrent, margin + 55, curY + 4.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(5, 150, 105); // emerald-600
    const cleanNyroh = h.nyroh.length > 42 ? `${h.nyroh.substring(0, 39)}...` : h.nyroh;
    doc.text(cleanNyroh, margin + 115, curY + 4.5);

    curY += 6.8;
  });

  // -------------------------------------------------------------
  // 7. BOX DE BENEFÍCIO FINANCEIRO ESTIMADO (ROI)
  // -------------------------------------------------------------
  curY += 3;
  doc.setFillColor(238, 242, 255); // indigo-50
  doc.setDrawColor(199, 210, 254); // indigo-200
  doc.setLineWidth(0.25);
  doc.roundedRect(margin, curY, contentWidth, 12, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(49, 46, 129); // indigo-900
  doc.text('ESTIMATIVA COMERCIAL DE CRESCIMENTO APÓS MIGRAÇÃO:', margin + 4, curY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(67, 56, 202);
  doc.text('• +300% de velocidade de carregamento em 4G/5G  |  • Canal de WhatsApp em 1 clique  |  • Recuperação de até 40% de tráfego perdido', margin + 4, curY + 9);

  // -------------------------------------------------------------
  // 8. RODAPÉ COMERCIAL DE FECHAMENTO (Fixado no Fim da Página A4)
  // -------------------------------------------------------------
  const footerHeight = 21;
  const footerY = pageHeight - footerHeight;

  doc.setFillColor(10, 17, 40); // navy escuro
  doc.rect(0, footerY, pageWidth, footerHeight, 'F');

  // Faixa decorativa superior do rodapé
  doc.setFillColor(37, 99, 235);
  doc.rect(0, footerY, pageWidth, 1, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('PROPOSTA EXCLUSIVA DE MIGRAÇÃO DIGITAL & RETENÇÃO DE CLIENTES', margin, footerY + 6.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(148, 163, 184);
  doc.text(`Para ativar sua nova página com padrão de alta conversão, contate seu consultor dedicado:`, margin, footerY + 11);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(56, 189, 248); // cyan claro
  doc.text(sellerName.toUpperCase(), margin, footerY + 16.5);

  // Validade da Auditoria à Direita
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text('Laudo confidencial emitido por Nyroh Enterprise. Condições válidas por 7 dias.', pageWidth - margin - 80, footerY + 16.5);

  // -------------------------------------------------------------
  // 9. SALVAR PDF COM NOME SANITIZADO
  // -------------------------------------------------------------
  const safeLeadName = report.leadName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'cliente';

  doc.save(`Laudo_Tecnico_Nyroh_${safeLeadName}.pdf`);
}

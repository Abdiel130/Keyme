/**
 * Kit de emergencia: PDF con instrucciones y un recuadro para escribir la
 * contraseña maestra A MANO. Nunca incluye la contraseña ni llaves.
 */
export async function downloadEmergencyKit(deviceName: string): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const ink: [number, number, number] = [30, 24, 20];
  const amber: [number, number, number] = [196, 128, 52];
  const muted: [number, number, number] = [110, 100, 92];
  const date = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

  doc.setFillColor(...ink);
  doc.rect(0, 0, W, 38, 'F');
  doc.setTextColor(240, 226, 205);
  doc.setFont('times', 'bold');
  doc.setFontSize(26);
  doc.text('Keyme', 20, 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Kit de emergencia', 20, 30);
  doc.text(date, W - 20, 30, { align: 'right' });

  let y = 54;
  const para = (text: string, size = 11, color = ink, gap = 6) => {
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, W - 40);
    doc.text(lines, 20, y);
    y += lines.length * (size * 0.42) + gap;
  };
  const heading = (text: string) => {
    doc.setFont('helvetica', 'bold');
    para(text, 13, amber, 3);
    doc.setFont('helvetica', 'normal');
  };

  para('Guarda esta hoja en un lugar físico seguro (una caja fuerte, un sobre cerrado con tus documentos). Es la única forma de recuperar tu vault si olvidas la contraseña maestra: Keyme no la conoce y nadie puede restablecerla.', 11, ink, 8);

  heading('Dirección de tu servidor');
  para(location.origin, 12, ink, 2);
  para(`Creado desde: ${deviceName}. Acceso solo dentro de tu red Tailscale.`, 9, muted, 8);

  heading('Contraseña maestra');
  para('Escríbela a mano, con letra clara. No la escribas en ningún archivo ni la fotografíes.', 10, muted, 4);
  doc.setDrawColor(...amber);
  doc.setLineWidth(0.6);
  doc.roundedRect(20, y, W - 40, 30, 3, 3);
  y += 42;

  heading('Cómo recuperar el acceso');
  for (const [i, step] of [
    'Conéctate a tu red Tailscale y abre la dirección de arriba en el navegador.',
    'Escribe la contraseña maestra de esta hoja para desbloquear el vault.',
    'Si el servidor se perdió: restaura el respaldo más reciente (./up.sh --restore) o importa tu archivo .keyme desde Ajustes → Importar.',
    'Si sospechas que alguien vio esta hoja: cambia la contraseña maestra y rota la Vault Key desde Ajustes → Seguridad.',
  ].entries()) {
    para(`${i + 1}.  ${step}`, 10.5, ink, 3);
  }
  y += 6;
  heading('Qué protege Keyme');
  para('Todo tu vault se cifra en tus dispositivos con XChaCha20-Poly1305 y una llave derivada con Argon2id. El servidor solo guarda datos cifrados: aunque alguien robe el servidor o un respaldo, sin esta contraseña no puede leer nada.', 10, muted, 4);

  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text('Keyme · gestor de contraseñas autohospedado y zero-knowledge', W / 2, 268, { align: 'center' });
  doc.save('Keyme-kit-de-emergencia.pdf');
}

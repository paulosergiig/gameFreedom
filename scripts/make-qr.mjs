import QRCode from 'qrcode';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const raw = process.argv[2] || process.env.PUBLIC_URL;
if (!raw) {
  console.error('Uso: npm run qr -- https://SEU-SUBDOMINIO.freedom.dev.br');
  process.exit(1);
}
let url;
try { url = new URL(raw); } catch { console.error('Informe uma URL HTTPS válida.'); process.exit(1); }
if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search ||
  !/^(?:[a-z0-9-]+\.)+freedom\.dev\.br$/i.test(url.hostname) || (url.pathname !== '/')) {
  console.error('Use a URL HTTPS final do jogo em um subdomínio de freedom.dev.br, sem credenciais, parâmetros ou caminhos.');
  process.exit(1);
}
const destination = path.resolve('output', 'qrcode');
await mkdir(destination, { recursive: true });
const text = url.origin + '/';
const options = { errorCorrectionLevel: 'M', margin: 4, color: { dark: '#141413', light: '#ffffff' } };
await QRCode.toFile(path.join(destination, 'freedom-qr.png'), text, { ...options, width: 1200 });
const svg = await QRCode.toString(text, { ...options, type: 'svg' });
await writeFile(path.join(destination, 'freedom-qr.svg'), svg, 'utf8');
await writeFile(path.join(destination, 'LEIA-ME.txt'),
  'DESAFIO FREEDOM\n' + text + '\n\nQR code para esta URL. Gerar o arquivo não publica o jogo. Teste a URL e o QR impresso em Android e iPhone antes de colocar no estande. Preserve a borda branca; não sobreponha a logo aos módulos.\n', 'utf8');
console.log('QR code criado em ' + destination + '\nDestino: ' + text);

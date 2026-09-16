import path from 'node:path';
import fs from 'node:fs';
import { backup } from 'node:sqlite';
import { configuration } from '../lib/config.mjs';
import { openDatabase, prune } from '../lib/store.mjs';

const usage = `Administração local do Desafio Freedom:
  node --env-file-if-exists=.env scripts/admin.mjs list
  node --env-file-if-exists=.env scripts/admin.mjs remove-player TAG --confirm
  node --env-file-if-exists=.env scripts/admin.mjs reset-event --confirm
  node --env-file-if-exists=.env scripts/admin.mjs backup [arquivo.sqlite]

list mostra os pontos de cada modo em colunas separadas.
remove-player exclui apelido, recordes dos dois modos, sessão e partidas da TAG.
reset-event exclui TODOS os participantes e resultados. Faça backup antes.
Execute localmente no servidor com a mesma DB_PATH da aplicação.
Backups também contêm apelidos: proteja-os e remova-os dentro da retenção.`;
const [command, ...args] = process.argv.slice(2);
if (!['list', 'remove-player', 'reset-event', 'backup'].includes(command)) {
  console.log(usage);
  process.exitCode = command ? 1 : 0;
} else {
  let db;
  try {
    const config = configuration();
    if (!fs.existsSync(config.dbPath)) throw new Error('Banco não encontrado. Confira DB_PATH e inicie o jogo uma vez.');
    if (['remove-player', 'reset-event'].includes(command) && !args.includes('--confirm')) throw new Error('Ação destrutiva exige a opção explícita --confirm. Faça backup antes.');
    db = openDatabase(config.dbPath);
    prune(db, Date.now());
    if (command === 'list') {
      console.table(db.prepare('SELECT p.tag AS identificador, p.name AS apelido, max(p.best, 0) AS desafio, coalesce(s.best, 0) AS freestyle FROM players p LEFT JOIN freestyle_scores s ON s.player_id = p.id WHERE p.name IS NOT NULL ORDER BY p.best DESC, p.best_at ASC').all());
    } else if (command === 'remove-player') {
      const tag = args.find(arg => !arg.startsWith('--'))?.toUpperCase();
      if (!/^[A-F0-9]{12}$/.test(tag ?? '')) throw new Error('Informe a TAG de 12 caracteres exibida por list.');
      const result = db.prepare('DELETE FROM players WHERE tag = ?').run(tag);
      console.log(result.changes ? 'Participante removido. A sessão correspondente foi encerrada.' : 'Participante não encontrado.');
    } else if (command === 'reset-event') {
      db.prepare('DELETE FROM players').run();
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      console.log('Rankings dos dois modos e participantes removidos.');
    } else {
      const destination = path.resolve(args[0] ?? path.join(path.dirname(config.dbPath), 'backups', `freedom-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`));
      const relative = path.relative(config.publicDir, destination);
      if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('Backup deve ficar fora de public.');
      if (fs.existsSync(destination)) throw new Error('O arquivo de destino já existe. Escolha outro nome.');
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      await backup(db, destination);
      console.log(`Backup consistente criado: ${destination}`);
    }
  } catch (e) { console.error(e.message); process.exitCode = 1; }
  finally { db?.close(); }
}

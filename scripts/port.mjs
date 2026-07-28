/**
 * Port ownership helpers for the measurement harness.
 *
 * Exists because of a real incident: a `next start` orphaned by a crashed
 * session kept listening on 3000 while a new build was produced. Every
 * measurement afterwards read the OLD build's HTML, which referenced chunks
 * that no longer existed on disk — so two of them 404'd, the script counted
 * them as 0 bytes, and the total came out at 181.5 KB instead of 235.6 KB.
 *
 * A stale server does not announce itself. It answers every request happily
 * with last week's bytes. The only defence is to refuse to measure against a
 * server this process did not start.
 */

import { execFileSync } from 'node:child_process';

/**
 * PIDs listening on `port`, with the command line that owns each one.
 *
 * Both branches are best-effort: a non-zero exit means "nothing found" for
 * these tools, not a real error, so it is swallowed and read as an empty list.
 */
export function findListeners(port) {
  if (process.platform === 'win32') {
    const script = `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique | ForEach-Object {
        $p = Get-CimInstance Win32_Process -Filter "ProcessId = $_" -ErrorAction SilentlyContinue
        if ($p) { "$($p.ProcessId) $($p.CommandLine)" }
      }`;
    let out = '';
    try {
      out = execFileSync(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        { encoding: 'utf8' },
      );
    } catch {
      return [];
    }
    return (
      out
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        // PID first, command line after the first space. Split on the first
        // space only — a Windows command line is full of them.
        .map((line) => {
          const separator = line.indexOf(' ');
          const pid = separator === -1 ? line : line.slice(0, separator);
          const command =
            separator === -1 ? '(unknown)' : line.slice(separator + 1).trim();
          return { pid: Number(pid), command };
        })
        .filter((entry) => Number.isInteger(entry.pid))
    );
  }

  let out = '';
  try {
    out = execFileSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], {
      encoding: 'utf8',
    });
  } catch {
    return [];
  }
  return out
    .split('\n')
    .map((line) => Number(line.trim()))
    .filter(Number.isInteger)
    .map((pid) => {
      let command = '';
      try {
        command = execFileSync('ps', ['-o', 'command=', '-p', String(pid)], {
          encoding: 'utf8',
        }).trim();
      } catch {
        command = '(unknown)';
      }
      return { pid, command };
    });
}

function kill(pid) {
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGKILL');
    }
  } catch {
    // Already gone, or not ours to kill. The verification pass below decides.
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Free `port`, or throw.
 *
 * Kills every listener, waits, then re-checks. If anything is still holding the
 * port, this THROWS rather than returning — measuring against a survivor is the
 * exact failure this module exists to prevent, and a wrong number that looks
 * plausible is worse than no number at all.
 *
 * Killing is deliberately unconditional. Filtering to "only processes that look
 * like ours" sounds safer but fails open: an orphan whose command line does not
 * match the expected shape would be left alive and silently measured.
 */
export async function ensurePortFree(port) {
  const listeners = findListeners(port);

  for (const listener of listeners) {
    console.log(`  killing PID ${listener.pid} on port ${port}: ${listener.command}`);
    kill(listener.pid);
  }

  if (listeners.length > 0) await sleep(1000);

  const survivors = findListeners(port);
  if (survivors.length > 0) {
    const detail = survivors.map((s) => `PID ${s.pid} (${s.command})`).join(', ');
    throw new Error(
      `Port ${port} is still held after kill: ${detail}. ` +
        `Refusing to measure — the server answering would not be the build just produced.`,
    );
  }

  return listeners.length;
}

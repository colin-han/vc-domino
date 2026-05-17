type Level = 'info' | 'warn' | 'error';

function emit(level: Level, op: string, fields: Record<string, unknown>) {
  const line = JSON.stringify({ time: new Date().toISOString(), level, op, ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}

export const log = {
  info: (op: string, fields: Record<string, unknown> = {}) => emit('info', op, fields),
  warn: (op: string, fields: Record<string, unknown> = {}) => emit('warn', op, fields),
  error: (op: string, fields: Record<string, unknown> = {}) => emit('error', op, fields),
};

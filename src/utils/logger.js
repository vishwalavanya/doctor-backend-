function safeSerialize(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      code: value.code,
      statusCode: value.statusCode,
      details: value.details
    };
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => safeSerialize(entry));
  }

  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = safeSerialize(entry);
    }
    return output;
  }

  return value;
}

function write(level, message, meta = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...safeSerialize(meta)
  };
  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info(message, meta = {}) {
    write('info', message, meta);
  },
  warn(message, meta = {}) {
    write('warn', message, meta);
  },
  error(message, meta = {}) {
    write('error', message, meta);
  },
  debug(message, meta = {}) {
    if (process.env.NODE_ENV !== 'production') {
      write('debug', message, meta);
    }
  }
};

export function createLogger(scope) {
  return {
    info(message, meta = {}) {
      logger.info(message, { scope, ...meta });
    },
    warn(message, meta = {}) {
      logger.warn(message, { scope, ...meta });
    },
    error(message, meta = {}) {
      logger.error(message, { scope, ...meta });
    },
    debug(message, meta = {}) {
      logger.debug(message, { scope, ...meta });
    }
  };
}


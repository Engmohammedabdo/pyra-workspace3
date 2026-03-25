const { randomUUID } = require('crypto');

function requestLogger(options = {}) {
  const logger = options.logger || console;

  return function requestLoggerMiddleware(req, res, next) {
    const requestId = req.headers['x-request-id'] || randomUUID();
    const start = process.hrtime.bigint();

    req.id = requestId;
    res.setHeader('X-Request-ID', requestId);

    const originalEnd = res.end;
    res.end = function (...args) {
      const duration = Number(process.hrtime.bigint() - start) / 1e6;

      const logEntry = {
        requestId,
        method: req.method,
        path: req.originalUrl || req.url,
        statusCode: res.statusCode,
        responseTimeMs: Math.round(duration * 100) / 100,
        timestamp: new Date().toISOString(),
      };

      if (res.statusCode >= 500) {
        logger.error(logEntry);
      } else if (res.statusCode >= 400) {
        logger.warn(logEntry);
      } else {
        logger.info(logEntry);
      }

      originalEnd.apply(this, args);
    };

    next();
  };
}

function errorHandler(logger = console) {
  return function errorHandlerMiddleware(err, req, res, _next) {
    const requestId = req.id || res.getHeader('X-Request-ID') || 'unknown';

    logger.error({
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      error: err.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
      timestamp: new Date().toISOString(),
    });

    const status = err.status || err.statusCode || 500;
    res.status(status).json({
      error: status < 500 ? err.message : 'Internal Server Error',
      requestId,
    });
  };
}

module.exports = { requestLogger, errorHandler };

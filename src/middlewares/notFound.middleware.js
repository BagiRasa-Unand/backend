const { sendError } = require('../utils/response.util');

function notFound(req, res, next) {
  return sendError(res, {
    statusCode: 404,
    message: `Rute '${req.method} ${req.originalUrl}' tidak ditemukan pada API server ini.`,
  });
}

module.exports = notFound;


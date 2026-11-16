/**
 * Response Utility standar sesuai PRD BagiRasa (Section 7.1)
 */
function sendSuccess(res, { statusCode = 200, message = 'Berhasil', data = null, meta = undefined }) {
  const responseBody = {
    success: true,
    message,
    data,
  };

  if (meta !== undefined) {
    responseBody.meta = meta;
  }

  return res.status(statusCode).json(responseBody);
}

function sendError(res, { statusCode = 500, message = 'Terjadi kesalahan pada server', errors = null }) {
  const responseBody = {
    success: false,
    message,
  };

  if (errors !== null) {
    responseBody.errors = errors;
  }

  return res.status(statusCode).json(responseBody);
}

module.exports = {
  sendSuccess,
  sendError,
};

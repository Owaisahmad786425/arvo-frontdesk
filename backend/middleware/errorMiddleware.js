module.exports = (err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500)
    console.error("Request failed", err.name, err.original?.code || "");
  res
    .status(status)
    .json({ error: status >= 500 ? "Unexpected server error" : err.message });
};

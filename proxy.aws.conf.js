const target = process.env.API_TARGET;

if (!target) {
  throw new Error(
    'Define API_TARGET con el dominio de CloudFront, por ejemplo https://<distribucion>.cloudfront.net',
  );
}

// CloudFront reenvía /api/* al API Gateway y quita el prefijo, así que el path no se reescribe.
module.exports = {
  '/api': {
    target,
    secure: true,
    changeOrigin: true,
    cookieDomainRewrite: 'localhost',
  },
};

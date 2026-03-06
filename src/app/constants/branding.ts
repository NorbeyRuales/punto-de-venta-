export const DEFAULT_LOGO_PATH = '/branding/logo.jpeg';

// Ligero placeholder inline para evitar íconos rotos mientras se sube el logo real.
// Usar data URL evita dependencias adicionales o assets binarios en el repo.
export const FALLBACK_LOGO_DATA_URL =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="Logo de tienda">' +
      '<defs>' +
        '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
          '<stop stop-color="#FFE6D5" offset="0"/>' +
          '<stop stop-color="#FFD6B0" offset="1"/>' +
        '</linearGradient>' +
      '</defs>' +
      '<rect width="200" height="200" fill="url(#g)" rx="24" />' +
      '<text x="50%" y="54%" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="#FF6B00">LOGO</text>' +
      '<text x="50%" y="74%" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#B45B3E">Sube el tuyo</text>' +
    '</svg>',
  );

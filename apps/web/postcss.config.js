// Config PostCSS próprio do front (apps/web).
// Sem este arquivo, o Vite sobe a árvore de pastas e pega um postcss.config.js de fora do projeto
// (C:\Users\faelr\Downloads), que quebra o build/dev. Tailwind 4 usa o plugin @tailwindcss/vite, então nada é necessário aqui.
export default {
  plugins: {},
};

module.exports = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: '#7EC636',
        brandHover: '#71B52F',
        surface: '#1F1F1F',   // ← new (the black for pills)
        surface2: '#2A2A2A'   // ← new (the slightly lighter surface)
      },
      fontFamily: {
        sans: ['-apple-system','BlinkMacSystemFont','SF Pro Text','Arial','Verdana','ui-sans-serif','system-ui']
      },
      boxShadow: { glow: '0 0 0 2px rgba(126,198,54,0.5)' }
    }
  },
  plugins: []
};

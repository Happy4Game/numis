export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        ink:    '#0E1626',
        panel:  '#172138',
        raised: '#1E2B47',
        line:   '#27324F',
        text:   '#E8EDF6',
        muted:  '#93A1BC',
        accent: '#5B8DEF',
        money:  '#35D6A4',
        warn:   '#F2B64B',
        alert:  '#F26D6D',
      },
    },
  },
  plugins: [],
}

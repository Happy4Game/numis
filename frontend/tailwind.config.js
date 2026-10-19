export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        deep:   '#070C17',
        ink:    '#0E1626',
        panel:  '#172138',
        raised: '#1E2B47',
        line:   '#27324F',
        hair:   '#334160',
        text:   '#E8EDF6',
        muted:  '#93A1BC',
        faint:  '#6B7A99',
        accent: '#5B8DEF',
        sky2:   '#7FB0FF',
        money:  '#35D6A4',
        warn:   '#F2B64B',
        alert:  '#F26D6D',
        violet: '#A78BFA',
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,.04) inset, 0 24px 60px -30px rgba(0,0,0,.8)',
        glow:  '0 0 40px -8px rgba(91,141,239,.45)',
      },
      backgroundImage: {
        'accent-line': 'linear-gradient(90deg, transparent, #5B8DEF, transparent)',
      },
    },
  },
  plugins: [],
}

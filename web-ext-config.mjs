export default {
  sourceDir: './dist',
  artifactsDir: './web-ext-artifacts',
  build: {
    overwriteDest: true,
  },
  run: {
    firefox: 'firefox',
    startUrl: ['https://nextdoor.com'],
    browserConsole: true,
  },
};

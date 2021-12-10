export default {
  input: 'lib/index.js',
  output: {
    file: 'lib/index.umd.js',
    format: 'umd',
    name: 'vue3-class',
    globals: {
      vue: 'Vue',
      'vue3-class': 'Vue3Class',
    },
    exports: 'named',
  },
  external: ['vue', 'vue3-class', 'reflect-metadata'],
}

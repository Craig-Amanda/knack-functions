import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
// ⬇️ use default import (not { terser })
import terser from '@rollup/plugin-terser';

export default [
  {
    input: 'knackFunctions.js',               // or 'src/index.js' if you move it later
    output: {
      file: 'dist/knackFunctions.iife.min.js',
      format: 'iife',
      name: 'KnackFns',
      sourcemap: false
    },
    plugins: [
      resolve(),
      commonjs(),
      terser()                                // minify
    ]
  }
];

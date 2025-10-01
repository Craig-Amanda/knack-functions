import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from '@rollup/plugin-terser';

export default [
  {
    // Use your existing file as the entry
    input: 'knackFunctions.js',
    output: {
      file: 'dist/knackFunctions.iife.min.js',
      format: 'iife',
      name: 'KnackFns',
      sourcemap: false
    },
    plugins: [resolve(), commonjs(), terser()]
  }
];

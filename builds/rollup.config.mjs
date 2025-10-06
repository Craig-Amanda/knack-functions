// builds/rollup.config.mjs
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

export default [{
    input: 'knackFunctions.js',
    // For a stable, all-in-one CDN artefact while you verify contents:
    treeshake: false,                 // keep everything (you can relax later)
    output: {
        file: 'dist/knackFunctions.iife.min.js',
        format: 'iife',
        name: 'KnackFns',
        inlineDynamicImports: true,   // force a single-file bundle
        sourcemap: false
    },
    plugins: [
        resolve({ browser: true }),
        commonjs(),
        terser({
            // Uncomment if you reflect on names at runtime
            // keep_fnames: true,
            // keep_classnames: true
        })
    ]
}];

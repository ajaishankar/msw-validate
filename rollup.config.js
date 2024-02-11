import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import { dts } from "rollup-plugin-dts";
import license from "rollup-plugin-license";

export default [
  {
    input: "src/index.ts",
    external: ["msw"],
    output: [
      {
        file: "dist/index.js",
        format: "es",
      },
      {
        file: "dist/cjs/index.js",
        format: "cjs",
      },
    ],
    context: "window",
    plugins: [
      resolve(),
      commonjs(),
      typescript({ removeComments: false }),
      license({
        thirdParty: {
          output: "dist/dependencies.txt",
        },
      }),
    ],
  },
  {
    input: "dist/index.d.ts",
    output: [{ file: "dist/types.d.ts", format: "es" }],
    plugins: [dts()],
  },
];

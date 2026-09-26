// Grid follows the displayed terrain and water without extra meshes or terrain copies.
export function attachScaleGrid(material) {
  const visible = { value: 1 }, spacing = { value: 128 };
  material.onBeforeCompile = shader => {
    shader.uniforms.scaleGridVisible = visible;
    shader.uniforms.scaleGridSpacing = spacing;
    shader.vertexShader = 'varying vec3 scaleGridPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nscaleGridPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = 'uniform float scaleGridVisible;\nuniform float scaleGridSpacing;\nvarying vec3 scaleGridPosition;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
      #include <dithering_fragment>
      vec2 grid = scaleGridPosition.xz / scaleGridSpacing;
      vec2 pixelWidth = max(fwidth(grid), vec2(0.00001));
      vec2 edge = abs(fract(grid - 0.5) - 0.5) / pixelWidth;
      float line = 1.0 - min(min(edge.x, edge.y), 1.0);
      float fade = 1.0 - smoothstep(0.04, 0.16, max(pixelWidth.x, pixelWidth.y));
      gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.69, 0.84, 0.80), line * fade * scaleGridVisible * 0.32);
    `);
  };
  material.customProgramCacheKey = () => 'fmm-scale-grid-v2';
  return { visible, spacing };
}

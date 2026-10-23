import Phaser from 'phaser';

/**
 * Picks the Phaser renderer: WebGL when the browser can really use it, the 2D canvas when it
 * can't. Some headless browsers and old GPUs hand out a WebGL context whose framebuffers are
 * "Incomplete Attachment"; Phaser then throws while booting, the scene never gets its
 * graphics objects and the whole new-game flow dies silently. So: try the exact thing Phaser
 * needs (a framebuffer with a texture attached) and fall back to Canvas if it isn't complete.
 * `?canvas` forces the 2D renderer, `?webgl` forces WebGL (to reproduce the problem).
 */
export function pickRenderer(): number {
  const params = new URLSearchParams(location.search);
  if (params.has('canvas')) return Phaser.CANVAS;
  if (params.has('webgl')) return Phaser.WEBGL;
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return Phaser.CANVAS;
    const texture = gl.createTexture();
    const buffer = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 16, 16, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(buffer);
    gl.deleteTexture(texture);
    return complete ? Phaser.AUTO : Phaser.CANVAS;
  } catch {
    return Phaser.CANVAS;
  }
}

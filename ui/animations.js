(() => {
  const canvas = document.getElementById('noise-canvas');
  const ctx = canvas.getContext('2d', { alpha: true });

  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };

  const draw = () => {
    const { width, height } = canvas;
    const imageData = ctx.createImageData(width, height);
    for (let i = 0; i < imageData.data.length; i += 4) {
      const value = Math.random() * 25;
      imageData.data[i] = value;
      imageData.data[i + 1] = value;
      imageData.data[i + 2] = value;
      imageData.data[i + 3] = 24;
    }
    ctx.putImageData(imageData, 0, 0);
    requestAnimationFrame(draw);
  };

  window.addEventListener('resize', resize);
  resize();
  draw();
})();

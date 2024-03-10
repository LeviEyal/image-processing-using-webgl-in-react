import { useEffect, useRef, useState } from 'react';
import { WebGLImageFilter } from './webgl-image-filter.js';

const filters = {
  sharpen: ['sharpen', 2],
  emboss: ['emboss', 1],
  negative: ['negative'],
  blackWhite: ['blackWhite'],
  organicOnly: ['organicOnly'],
  stripOrganic: ['stripOrganic'],
  contrast: ['contrast', 2.5],
  osFilter: ['osFilter', [0.0, 2], 1],
  O2Filter: ['O2Filter', [2, 256], 1],
  senFilter: ['senFilter'],
};

function App() {
  const canvasRef = useRef(null);
  const inputCanvasRef = useRef(null);
  const [filter, setFilter] = useState('negative');

  const handleFilterChange = (newFilter) => {
    console.log('toggle', newFilter);
    setFilter(newFilter);
  };

  useEffect(() => {
    const inputImage = new Image();
    inputImage.src = '/top_view.png';
    console.log('filter:', filter);

    inputImage.onload = () => {
      const canvas = canvasRef.current;
      const filterManager = new WebGLImageFilter();

      filterManager.reset();
      filterManager.addFilter(...filters[filter]);
      const filteredImage = filterManager.apply(inputImage);

      const ctx = canvas.getContext('2d');
      ctx.drawImage(filteredImage, 0, 0);

      const inputCanvas = inputCanvasRef.current;
      const inputCtx = inputCanvas.getContext('2d');
      inputCtx.drawImage(inputImage, 0, 0);
    };
  }, [filter]);

  return (
    <div
      style={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          margin: 'auto',
        }}
      >
        <canvas ref={canvasRef} width={800} height={600} />
        <canvas ref={inputCanvasRef} width={800} height={600} />
      </div>
      <div
        style={{
          display: 'flex',
          paddingBottom: '150px',
        }}
      >
        {Object.keys(filters).map((f) => {
          return (
            <button
              style={{
                margin: '5px',
                border: '1px solid black',
              }}
              onClick={() => handleFilterChange(f)}
            >
              {f}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default App;

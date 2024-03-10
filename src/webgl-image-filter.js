/* 
WebGLImageFilter - MIT Licensed

2013, Dominic Szablewski - phoboslab.org
*/

/*
WebGLImageFilter - MIT Licensed

2013, Dominic Szablewski - phoboslab.org
*/
export class WebGLProgram {
  constructor(gl, vertexSource, fragmentSource) {
    var _collect = function (source, prefix, collection) {
      var r = new RegExp('\\b' + prefix + ' \\w+ (\\w+)', 'ig');
      source.replace(r, function (match, name) {
        collection[name] = 0;
        return match;
      });
    };

    var _compile = function (gl, source, type) {
      var shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.log(gl.getShaderInfoLog(shader));
        return null;
      }
      return shader;
    };

    this.uniform = {};
    this.attribute = {};

    var _vsh = _compile(gl, vertexSource, gl.VERTEX_SHADER);
    var _fsh = _compile(gl, fragmentSource, gl.FRAGMENT_SHADER);

    this.id = gl.createProgram();
    gl.attachShader(this.id, _vsh);
    gl.attachShader(this.id, _fsh);
    gl.linkProgram(this.id);

    if (!gl.getProgramParameter(this.id, gl.LINK_STATUS)) {
      console.log(gl.getProgramInfoLog(this.id));
    }

    gl.useProgram(this.id);

    // Collect attributes
    _collect(vertexSource, 'attribute', this.attribute);
    for (var a in this.attribute) {
      this.attribute[a] = gl.getAttribLocation(this.id, a);
    }

    // Collect uniforms
    _collect(vertexSource, 'uniform', this.uniform);
    _collect(fragmentSource, 'uniform', this.uniform);
    for (var u in this.uniform) {
      this.uniform[u] = gl.getUniformLocation(this.id, u);
    }
  }
}

export var WebGLImageFilter = (window.WebGLImageFilter = function (params) {
  if (!params) params = {};

  var gl = null,
    _drawCount = 0,
    _sourceTexture = null,
    _lastInChain = false,
    _currentFramebufferIndex = -1,
    _tempFramebuffers = [null, null],
    _filterChain = [],
    _width = -1,
    _height = -1,
    _vertexBuffer = null,
    _currentProgram = null,
    _canvas = params.canvas || document.createElement('canvas');

  // key is the shader program source, value is the compiled program
  var _shaderProgramCache = {};

  var gl =
    _canvas.getContext('webgl') || _canvas.getContext('experimental-webgl');
  if (!gl) {
    throw "Couldn't get WebGL context";
  }

  this.addFilter = function (name) {
    var args = Array.prototype.slice.call(arguments, 1);
    var filter = _filter[name];

    _filterChain.push({ func: filter, args: args });
  };

  this.reset = function () {
    _filterChain = [];
  };

  var applied = false;

  this.apply = function (image) {
    _resize(image.width, image.height);
    _drawCount = 0;

    // Create the texture for the input image if we haven't yet
    if (!_sourceTexture) _sourceTexture = gl.createTexture();

    gl.bindTexture(gl.TEXTURE_2D, _sourceTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    if (!applied) {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        image
      );
      applied = true;
    } else {
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        image
      );
    }

    // No filters? Just draw
    if (_filterChain.length == 0) {
      var program = _compileShader(SHADER.FRAGMENT_IDENTITY);
      _draw();
      return _canvas;
    }

    for (var i = 0; i < _filterChain.length; i++) {
      _lastInChain = i == _filterChain.length - 1;
      var f = _filterChain[i];

      f.func.apply(this, f.args || []);
    }

    return _canvas;
  };

  var _resize = function (width, height) {
    // Same width/height? Nothing to do here
    if (width == _width && height == _height) {
      return;
    }

    _canvas.width = _width = width;
    _canvas.height = _height = height;

    // Create the context if we don't have it yet
    if (!_vertexBuffer) {
      // Create the vertex buffer for the two triangles [x, y, u, v] * 6
      var vertices = new Float32Array([
        -1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0, -1, 1, 0, 0, 1, -1, 1, 1, 1, 1,
        1, 0,
      ]);
      (_vertexBuffer = gl.createBuffer()),
        gl.bindBuffer(gl.ARRAY_BUFFER, _vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

      // Note sure if this is a good idea; at least it makes texture loading
      // in Ejecta instant.
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    }

    gl.viewport(0, 0, _width, _height);

    // Delete old temp framebuffers
    _tempFramebuffers = [null, null];
  };

  var _getTempFramebuffer = function (index) {
    _tempFramebuffers[index] =
      _tempFramebuffers[index] || _createFramebufferTexture(_width, _height);

    return _tempFramebuffers[index];
  };

  var _createFramebufferTexture = function (width, height) {
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

    var renderbuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);

    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0
    );

    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { fbo: fbo, texture: texture };
  };

  var _draw = function (flags) {
    var source = null,
      target = null,
      flipY = false;

    // Set up the source
    if (_drawCount == 0) {
      // First draw call - use the source texture
      source = _sourceTexture;
    } else {
      // All following draw calls use the temp buffer last drawn to
      source = _getTempFramebuffer(_currentFramebufferIndex).texture;
    }
    _drawCount++;

    // Set up the target
    if (_lastInChain && !(flags & DRAW.INTERMEDIATE)) {
      // Last filter in our chain - draw directly to the WebGL Canvas. We may
      // also have to flip the image vertically now
      target = null;
      flipY = _drawCount % 2 == 0;
    } else {
      // Intermediate draw call - get a temp buffer to draw to
      _currentFramebufferIndex = (_currentFramebufferIndex + 1) % 2;
      target = _getTempFramebuffer(_currentFramebufferIndex).fbo;
    }

    // Bind the source and target and draw the two triangles
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);

    gl.uniform1f(_currentProgram.uniform.flipY, flipY ? -1 : 1);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  var _compileShader = function (fragmentSource) {
    if (_shaderProgramCache[fragmentSource]) {
      _currentProgram = _shaderProgramCache[fragmentSource];
      gl.useProgram(_currentProgram.id);
      return _currentProgram;
    }

    // Compile shaders
    _currentProgram = new WebGLProgram(
      gl,
      SHADER.VERTEX_IDENTITY,
      fragmentSource
    );

    var floatSize = Float32Array.BYTES_PER_ELEMENT;
    var vertSize = 4 * floatSize;
    gl.enableVertexAttribArray(_currentProgram.attribute.pos);
    gl.vertexAttribPointer(
      _currentProgram.attribute.pos,
      2,
      gl.FLOAT,
      false,
      vertSize,
      0 * floatSize
    );
    gl.enableVertexAttribArray(_currentProgram.attribute.uv);
    gl.vertexAttribPointer(
      _currentProgram.attribute.uv,
      2,
      gl.FLOAT,
      false,
      vertSize,
      2 * floatSize
    );

    _shaderProgramCache[fragmentSource] = _currentProgram;
    return _currentProgram;
  };

  var DRAW = { INTERMEDIATE: 1 };

  var SHADER = {};
  SHADER.VERTEX_IDENTITY = `
    precision highp float;
    attribute vec2 pos;
    attribute vec2 uv;
    varying vec2 vUv;
    uniform float flipY;

    void main(void) {
        vUv = uv;
        gl_Position = vec4(pos.x, pos.y*flipY, 0.0, 1.);
    }`;

  SHADER.FRAGMENT_IDENTITY = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D texture;

    void main(void) {
        gl_FragColor = texture2D(texture, vUv);
    }`;

  var _filter = {};

  // -------------------------------------------------------------------------
  // Color Matrix Filter

  _filter.colorMatrix = function (matrix) {
    // Create a Float32 Array and normalize the offset component to 0-1
    var m = new Float32Array(matrix);
    m[4] /= 255;
    m[9] /= 255;
    m[14] /= 255;
    m[19] /= 255;

    // Can we ignore the alpha value? Makes things a bit faster.
    var shader =
      1 == m[18] &&
      0 == m[3] &&
      0 == m[8] &&
      0 == m[13] &&
      0 == m[15] &&
      0 == m[16] &&
      0 == m[17] &&
      0 == m[19]
        ? _filter.colorMatrix.SHADER.WITHOUT_ALPHA
        : _filter.colorMatrix.SHADER.WITH_ALPHA;

    var program = _compileShader(shader);
    gl.uniform1fv(program.uniform.m, m);
    _draw();
  };

  _filter.colorMatrix.SHADER = {};
  _filter.colorMatrix.SHADER.WITH_ALPHA = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D texture;
    uniform float m[20];

    void main(void) {
        vec4 c = texture2D(texture, vUv);
        gl_FragColor.r = m[0] * c.r + m[1] * c.g + m[2] * c.b + m[3] * c.a + m[4];
        gl_FragColor.g = m[5] * c.r + m[6] * c.g + m[7] * c.b + m[8] * c.a + m[9];
        gl_FragColor.b = m[10] * c.r + m[11] * c.g + m[12] * c.b + m[13] * c.a + m[14];
        gl_FragColor.a = m[15] * c.r + m[16] * c.g + m[17] * c.b + m[18] * c.a + m[19];
    }`;

  _filter.colorMatrix.SHADER.WITHOUT_ALPHA = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D texture;
    uniform float m[20];

    void main(void) {
        vec4 c = texture2D(texture, vUv);
        gl_FragColor.r = m[0] * c.r + m[1] * c.g + m[2] * c.b + m[4];
        gl_FragColor.g = m[5] * c.r + m[6] * c.g + m[7] * c.b + m[9];
        gl_FragColor.b = m[10] * c.r + m[11] * c.g + m[12] * c.b + m[14];
        gl_FragColor.a = c.a;
    }`;

  _filter.brightness = function (brightness) {
    var b = (brightness || 0) + 1;
    _filter.colorMatrix([
      b,
      0,
      0,
      0,
      0,
      0,
      b,
      0,
      0,
      0,
      0,
      0,
      b,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
    ]);
  };

  _filter.saturation = function (amount) {
    var x = ((amount || 0) * 2) / 3 + 1;
    var y = (x - 1) * -0.5;
    _filter.colorMatrix([
      x,
      y,
      y,
      0,
      0,
      y,
      x,
      y,
      0,
      0,
      y,
      y,
      x,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
    ]);
  };

  _filter.contrast = function (amount) {
    var v = (amount || 0) + 1;
    var o = -128 * (v - 1);

    _filter.colorMatrix([
      v,
      0,
      0,
      0,
      o,
      0,
      v,
      0,
      0,
      o,
      0,
      0,
      v,
      0,
      o,
      0,
      0,
      0,
      1,
      0,
    ]);
  };

  _filter.negative = function () {
    _filter.contrast(-2);
  };

  // -------------------------------------------------------------------------
  // Convolution Filter
  _filter.convolution = function (matrix) {
    var m = new Float32Array(matrix);
    var pixelSizeX = 1 / _width;
    var pixelSizeY = 1 / _height;

    var program = _compileShader(_filter.convolution.SHADER);
    gl.uniform1fv(program.uniform.m, m);
    gl.uniform2f(program.uniform.px, pixelSizeX, pixelSizeY);
    _draw();
  };

  _filter.convolution.SHADER = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D texture;
    uniform vec2 px;
    uniform float m[9];

    void main(void) {
        vec4 c11 = texture2D(texture, vUv - px); // top left
        vec4 c12 = texture2D(texture, vec2(vUv.x, vUv.y - px.y)); // top center
        vec4 c13 = texture2D(texture, vec2(vUv.x + px.x, vUv.y - px.y)); // top right

        vec4 c21 = texture2D(texture, vec2(vUv.x - px.x, vUv.y) ); // mid left
        vec4 c22 = texture2D(texture, vUv); // mid center
        vec4 c23 = texture2D(texture, vec2(vUv.x + px.x, vUv.y) ); // mid right

        vec4 c31 = texture2D(texture, vec2(vUv.x - px.x, vUv.y + px.y) ); // bottom left
        vec4 c32 = texture2D(texture, vec2(vUv.x, vUv.y + px.y) ); // bottom center
        vec4 c33 = texture2D(texture, vUv + px ); // bottom right

        gl_FragColor = 
            c11 * m[0] + c12 * m[1] + c22 * m[2] +
            c21 * m[3] + c22 * m[4] + c23 * m[5] +
            c31 * m[6] + c32 * m[7] + c33 * m[8];
        gl_FragColor.a = c22.a;
    }`;

  _filter.detectEdges = function () {
    _filter.convolution.call(this, [0, 1, 0, 1, -4, 1, 0, 1, 0]);
  };

  _filter.sharpen = function (amount) {
    var a = amount || 1;
    _filter.convolution.call(this, [
      0,
      -1 * a,
      0,
      -1 * a,
      1 + 4 * a,
      -1 * a,
      0,
      -1 * a,
      0,
    ]);
  };

  _filter.emboss = function (size) {
    var s = size || 1;
    _filter.convolution.call(this, [
      -2 * s,
      -1 * s,
      0,
      -1 * s,
      1,
      1 * s,
      0,
      1 * s,
      2 * s,
    ]);
  };

  // -------------------------------------------------------------------------
  _filter.osFilter = function (_hue_range, _lightness_for_deleted) {
    var program = _compileShader(_filter.osFilter.SHADER);
    gl.uniform2f(program.uniform.hue_range, _hue_range[0], _hue_range[1]);
    gl.uniform1f(program.uniform.lightness_for_deleted, _lightness_for_deleted);
    _draw();
  };

  _filter.osFilter.SHADER = `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D texture;
        uniform vec2 hue_range;
        uniform float lightness_for_deleted;
        void main(void) {
            vec4 c = texture2D(texture, vUv);
            float lightness = (c.r + c.g + c.b) / 3.0;
            float hue = 0.0;
            if (c.r >= c.g && c.r >= c.b) {
                hue = (c.g - c.b) / (c.r - min(c.g, c.b));
            } else if (c.g >= c.r && c.g >= c.b) {
                hue = 2.0 + (c.b - c.r) / (c.g - min(c.r, c.b));
            } else {
                hue = 4.0 + (c.r - c.g) / (c.b - min(c.r, c.g));
            }
            if (hue >= hue_range[0] && hue <= hue_range[1]) {
                gl_FragColor = vec4(lightness_for_deleted, lightness_for_deleted, lightness_for_deleted, c.a);
            } else {
                gl_FragColor = c;
            }
        }
    `;

  // -------------------------------------------------------------------------
  _filter.O2Filter = function (_hue_range, _lightness_for_deleted) {
    var program = _compileShader(_filter.O2Filter.SHADER);
    gl.uniform2f(program.uniform.hue_range, _hue_range[0], _hue_range[1]);
    gl.uniform1f(program.uniform.lightness_for_deleted, _lightness_for_deleted);
    _draw();
  };

  _filter.O2Filter.SHADER = `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D texture;
        uniform vec2 hue_range;
        uniform float lightness_for_deleted;
        void main(void) {
            vec4 c = texture2D(texture, vUv);
            float lightness = (c.r + c.g + c.b) / 3.0;
            float hue = 0.0;
            if (c.r >= c.g && c.r >= c.b) {
                hue = (c.g - c.b) / (c.r - min(c.g, c.b));
            } else if (c.g >= c.r && c.g >= c.b) {
                hue = 2.0 + (c.b - c.r) / (c.g - min(c.r, c.b));
            } else {
                hue = 4.0 + (c.r - c.g) / (c.b - min(c.r, c.g));
            }
            if (hue >= hue_range[0] && hue <= hue_range[1]) {
                gl_FragColor = vec4(lightness_for_deleted, lightness_for_deleted, lightness_for_deleted, c.a);
            } else {
                gl_FragColor = c;
            }
        }`;

  // -------------------------------------------------------------------------
  _filter.senFilter = function () {
    var program = _compileShader(_filter.senFilter.SHADER);
    _draw();
  };

  _filter.senFilter.SHADER = `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D texture;
        void main(void) {
            vec4 c = texture2D(texture, vUv);
            float lightness = (c.r + c.g + c.b) / 3.0;
            gl_FragColor = vec4(lightness, lightness, lightness, c.a);
        }`;

  // -------------------------------------------------------------------------
  // Black and white filter
  _filter.blackWhite = function () {
    var program = _compileShader(_filter.blackWhite.SHADER);
    _draw();
  };

  _filter.blackWhite.SHADER = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D texture;
    void main(void) {
        vec4 c = texture2D(texture, vUv);
        float lightness = (c.r + c.g + c.b) / 3.0;
        gl_FragColor = vec4(lightness, lightness, lightness, c.a);
    }`;

  // -------------------------------------------------------------------------
  // Organic strip filter
  _filter.stripOrganic = function () {
    var program = _compileShader(stripSHADER);
    gl.uniform2f(program.uniform.hue_range, 0, 2);
    _draw();
  };

  _filter.organicOnly = function () {
    var program = _compileShader(stripSHADER);
    gl.uniform2f(program.uniform.hue_range, 1.5, 255);
    _draw();
  };

  const stripSHADER = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D texture;
    uniform vec2 hue_range;
    void main(void) {
        vec4 c = texture2D(texture, vUv);
        float lightness = (c.r + c.g + c.b) / 3.0;
        float hue = 0.0;
        if (c.r >= c.g && c.r >= c.b) {
            hue = (c.g - c.b) / (c.r - min(c.g, c.b));
        } else if (c.g >= c.r && c.g >= c.b) {
            hue = 2.0 + (c.b - c.r) / (c.g - min(c.r, c.b));
        } else {
            hue = 4.0 + (c.r - c.g) / (c.b - min(c.r, c.g));
        }
        if (hue >= hue_range[0] && hue <= hue_range[1]) {
            gl_FragColor = vec4(lightness, lightness, lightness, 0.4);
        } else {
            gl_FragColor = c;
        }
    }`;
});


//
//  initShaders.js
//



// ----------------------------------------------------------------------------
/**
* Creates and compiles a shader.
*/
function compileShader(gl, shaderSource, shaderType) {

    // Create the shader object
    var shader = gl.createShader(shaderType);

    // Set the shader source code.
    gl.shaderSource(shader, shaderSource);

    // Compile the shader
    gl.compileShader(shader);

    // Check if it compiled
    var success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (!success) {
        // Something went wrong during compilation; get the error
        //throw "could not compile shader:" + 
        console.log(gl.getShaderInfoLog(shader));
    }

    return shader;
}

// ----------------------------------------------------------------------------
/**
 * Creates a program from 2 shaders.
 */
function createProgram(gl, vertexShader, fragmentShader) {

    // Create a program.
    var program = gl.createProgram();

    // Attach the shaders.
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);

    // Link the program.
    gl.linkProgram(program);

    // Check link status
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("Error linking program", gl.getProgramInfoLog(program));
        return;
    }

    // Validate gl-context
    gl.validateProgram(program);
    if (!gl.getProgramParameter(program, gl.VALIDATE_STATUS)) {
        console.error("Error validating program", gl.getProgramInfoLog(program));
        return;
    }

    return program;
};


function initShaders(gl, vertexShaderId, fragmentShaderId) {
    var vertShdr;
    var fragShdr;

    var vertElem = document.getElementById(vertexShaderId);
    if (!vertElem) {
        alert("Unable to load vertex shader " + vertexShaderId);
        return -1;
    }
    else {
        vertShdr = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertShdr, vertElem.text);
        gl.compileShader(vertShdr);
        if (!gl.getShaderParameter(vertShdr, gl.COMPILE_STATUS)) {
            var msg = "Vertex shader failed to compile.  The error log is:"
                + "<pre>" + gl.getShaderInfoLog(vertShdr) + "</pre>";
            alert(msg);
            return -1;
        }
    }

    var fragElem = document.getElementById(fragmentShaderId);
    if (!fragElem) {
        alert("Unable to load vertex shader " + fragmentShaderId);
        return -1;
    }
    else {
        fragShdr = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragShdr, fragElem.text);
        gl.compileShader(fragShdr);
        if (!gl.getShaderParameter(fragShdr, gl.COMPILE_STATUS)) {
            var msg = "Fragment shader failed to compile.  The error log is:"
                + "<pre>" + gl.getShaderInfoLog(fragShdr) + "</pre>";
            alert(msg);
            return -1;
        }
    }

    var program = gl.createProgram();
    gl.attachShader(program, vertShdr);
    gl.attachShader(program, fragShdr);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        var msg = "Shader program failed to link.  The error log is:"
            + "<pre>" + gl.getProgramInfoLog(program) + "</pre>";
        alert(msg);
        return -1;
    }

    return program;
}


function createUVGridTexture(gl) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const size = 512; //2048;//1024;
    const step = 32; //32;
    //function uvtexture(size, step) {
    let tex = [];
    for (let u = 0; u < size; u++) {
        for (let v = 0; v < size; v++) {

            // v-lines (red)
            if (u % step == 0 && v % step != 0)
                tex.push(160, 20, 0, 255);
            // u-lines (blue)
            else if (u % step != 0 && v % step == 0)
                tex.push(0, 160, 0, 255);
            // cross points
            else if (u % step == 0 && v % step == 0)
                tex.push(80, 80, 0, 255);
            else
                tex.push(255, 255, 255, 255);
        }
    }
    tex = new Uint8Array(tex);
    //}

    const level = 0;
    const internalFormat = gl.RGBA;
    const width = size;
    const height = size;
    const border = 0;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    const pixel = tex;
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, width, height, border, srcFormat, srcType,
        pixel);

    gl.generateMipmap(gl.TEXTURE_2D);

    function isPowerOf2(value) {
        return (value & (value - 1)) == 0;
    }

    return texture;
}


// --- texture object
function loadTexture(gl, url, type = gl.UNSIGNED_BYTE) {

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Because images have to be download over the internet
    // they might take a moment until they are ready.
    // Until then put a single pixel in the texture so we can
    // use it immediately. When the image has finished downloading
    // we'll update the texture with the contents of the image.
    const level = 0;
    const internalFormat = gl.RGBA;
    const width = 1;
    const height = 1;
    const border = 0;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    const pixel = new Uint8Array([0, 0, 255, 255]);  // opaque blue
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, width, height, border, srcFormat, srcType,
        pixel);


    const image = new Image();
    image.crossOrigin="anonymous";
    image.src = url;
    image.onload = function () {

        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, srcFormat, srcType, image);

        // WebGL1 has different requirements for power of 2 images
        // vs non power of 2 images so check if the image is a
        // power of 2 in both dimensions.
        if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
            // Yes, it's a power of 2. Generate mips.

            // GL_NEAREST_MIPMAP_NEAREST: takes the nearest mipmap to match the pixel size and uses nearest neighbor interpolation for texture sampling.
            // GL_LINEAR_MIPMAP_NEAREST: takes the nearest mipmap level and samples that level using linear interpolation.
            // GL_NEAREST_MIPMAP_LINEAR: linearly interpolates between the two mipmaps that most closely match the size of a pixel and samples the interpolated level via nearest neighbor interpolation.
            // GL_LINEAR_MIPMAP_LINEAR: linearly interpolates between the two closest mipmaps and samples the interpolated level via linear interpolation.

            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        } else {
            // No, it's not a power of 2. Turn off mips and set
            // wrapping to clamp to edge
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(GL_TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        }
    };

    function isPowerOf2(value) {
        return (value & (value - 1)) == 0;
    }
    return texture;
};



function MouseTracker() {

    canvas.addEventListener("mousedown", onMouseDown, false);
    let dragging = false;
    let touchStarted = false;

    let rotX = 0;
    let rotY = 0;
    let dist = 0;
    let mind = -2, maxd = 10;

    let degreesPerPixelX = 270 / canvas.height;
    let degreesPerPixelY = 270 / canvas.width;
    let distancePerPixel = 50 / canvas.height;
    //let xLimit = 85;
    let button = -1;    

    this.rotx = function () { return rotX; }
    this.roty = function () { return rotY; }
    this.dist = function () { return dist; }
    this.button = function () { return button; }


    MouseTracker.prototype.getter = function () { return mind; }
    this.prop = -1;

    // public.setDistRange = function(_min, _max, _distancePerPixel) 
    // {
    //     min = _min;
    //     max = _max;
    //     distancePerPixel = _distancePerPixel;
    // }

    function onMouseDown(evt) {
        if (dragging) return;
        dragging = true;
        button = evt.button;
        document.addEventListener("mousemove", onMouseMove, false);
        document.addEventListener("mouseup", onMouseUp, false);
    }

    function onMouseMove(evt) {
        if (!dragging) return;

        if (button == 0) {
            rotX += degreesPerPixelX * evt.movementY;
            rotY += degreesPerPixelY * evt.movementX;
        }
        if (button == 2) {
            dist += distancePerPixel * evt.movementY;
            dist = dist < mind ? mind : dist > maxd ? maxd : dist;
        }
    }

    function onMouseUp(evt) {
        if (!dragging) return;
        dragging = false;
        button = -1;
        document.removeEventListener("mousemove", onMouseMove, false);
        document.removeEventListener("mouseup", onMouseUp, false);
    }
        
    return this;
}

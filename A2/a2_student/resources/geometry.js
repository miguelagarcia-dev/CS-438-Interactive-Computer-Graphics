// ----------------------------------------------------------------------------
function quadGeometry() {

    var points = [
        vec3(-1, -1, 0),
        vec3(+1, -1, 0),
        vec3(+1, +1, 0),
        vec3(-1, +1, 0),
    ];

    var colors = [
        vec3(1.0, 0.0, 0.0),
        vec3(0.0, 1.0, 0.0),
        vec3(0.0, 0.0, 1.0),
        vec3(1.0, 1.0, 1.0),
    ];

    indices = [0, 1, 2, 2, 3, 0];
    vertices = flattenArrays(points, colors);
    return { vertices, indices };
}

// ----------------------------------------------------------------------------
function coordinateFrame() {
    var points = [
        vec3(-0.5, 0, 0), vec3(1, 0, 0),
        vec3(+1.0, 0, 0), vec3(1, 0, 0),
        vec3(0, -0.5, 0), vec3(0, 1, 0),
        vec3(0, +1.0, 0), vec3(0, 1, 0),
        vec3(0, 0, -0.5), vec3(0, 0, 1),
        vec3(0, 0, +1.0), vec3(0, 0, 1)
    ];
    const vertices = flatten(points);
    const stride = 6 * Float32Array.BYTES_PER_ELEMENT;
    return { vertices, stride };
}


// ----------------------------------------------------------------------------
function circleGeometry(segments = 12, radius = 1.0) {

    var pi2 = 2 * Math.PI;
    var step = pi2 / segments;
    var points = [];
    var colors = [];

    points.push(vec3(0.0, 0.0, 0.0));
    colors.push(vec3(1.0, 1.0, 1.0));

    for (var i = 0; i < segments + 1; i++) {
        var v = vec3(radius * Math.cos(i * step), radius * Math.sin(i * step), 0.0);
        points.push(v);
        var hue = (i * step) / pi2;
        colors.push(hsvToRgb(hue, 1, 1));
    }
    var vertices = flattenArrays(points, colors);
    var stride = 6 * Float32Array.BYTES_PER_ELEMENT;
    return { vertices, stride };
}

// ----------------------------------------------------------------------------
// Generates a uv-cube geometry for a given number of segments.
function cubeGeometry() {
    const vertices = [
        // Front face: white
        -1.0, -1.0, 1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0,
        1.0, -1.0, 1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 1.0, 0.0,
        1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0,

        // Back face: red
        -1.0, -1.0, -1.0, 1.0, 0.0, 0.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 1.0, -1.0, 1.0, 0.0, 0.0, 0.0, 0.0, -1.0, 1.0, 0.0,
        1.0, 1.0, -1.0, 1.0, 0.0, 0.0, 0.0, 0.0, -1.0, 1.0, 1.0,
        1.0, -1.0, -1.0, 1.0, 0.0, 0.0, 0.0, 0.0, -1.0, 0.0, 1.0,

        // Top face: green
        -1.0, 1.0, -1.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, -1.0, 1.0, 1.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0, 0.0,
        1.0, 1.0, 1.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0,
        1.0, 1.0, -1.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0,

        // Bottom face: blue
        -1.0, -1.0, -1.0, 0.0, 0.0, 1.0, 0.0, -1.0, 0.0, 0.0, 0.0,
        1.0, -1.0, -1.0, 0.0, 0.0, 1.0, 0.0, -1.0, 0.0, 1.0, 0.0,
        1.0, -1.0, 1.0, 0.0, 0.0, 1.0, 0.0, -1.0, 0.0, 1.0, 1.0, -1.0, -1.0, 1.0, 0.0, 0.0, 1.0, 0.0, -1.0, 0.0, 0.0, 1.0,

        // Right face: yellow
        1.0, -1.0, -1.0, 1.0, 1.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0,
        1.0, 1.0, -1.0, 1.0, 1.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0,
        1.0, 1.0, 1.0, 1.0, 1.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0,
        1.0, -1.0, 1.0, 1.0, 1.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0,

        // Left face: purple
        -1.0, -1.0, -1.0, 1.0, 0.0, 1.0, -1.0, 0.0, 0.0, 0.0, 0.0, -1.0, -1.0, 1.0, 1.0, 0.0, 1.0, -1.0, 0.0, 0.0, 1.0, 0.0, -1.0, 1.0, 1.0, 1.0, 0.0, 1.0, -1.0, 0.0, 0.0, 1.0, 1.0, -1.0, 1.0, -1.0, 1.0, 0.0, 1.0, -1.0, 0.0, 0.0, 0.0, 1.0,
    ];

    const indices = [
        0, 1, 2, 0, 2, 3, // front
        4, 5, 6, 4, 6, 7, // back
        8, 9, 10, 8, 10, 11, // top
        12, 13, 14, 12, 14, 15, // bottom
        16, 17, 18, 16, 18, 19, // right
        20, 21, 22, 20, 22, 23, // left
    ];

    const stride = 11 * Float32Array.BYTES_PER_ELEMENT;
    return { vertices, indices, stride };
}

// ----------------------------------------------------------------------------
// Generates a uv-sphere geometry for a given number of segments. 
function sphereGeometry(heightSegments = 12, widthSegments = 24, radius = 1.0) {

    noise.seed(Math.random());
    const pi = Math.PI;
    const pi2 = 2 * pi;
    let vertices = [];
    let indices = [];
    const stride = 11 * Float32Array.BYTES_PER_ELEMENT;

    // Generate the individual vertices in our vertex buffer.
    for (let y = 0; y <= heightSegments; y++) {
        for (let x = 0; x <= widthSegments; x++) {
            // Generate a vertex based on its spherical coordinates
            const u = x / widthSegments;
            const v = y / heightSegments;
            const theta = u * pi2;
            const phi = v * pi;
            const sinTheta = Math.sin(theta);
            const cosTheta = Math.cos(theta);
            const sinPhi = Math.sin(phi);
            const cosPhi = Math.cos(phi);
            const ux = cosTheta * sinPhi;
            const uy = cosPhi;
            const uz = sinTheta * sinPhi;
            // add positions
            vertices.push(radius * ux, radius * uy, radius * uz);
            // ad colors
            const w = (2 * Math.cos(3 * phi));
            const c = (1 + noise.simplex3(ux * w, uy * w, uz * w)) / 2;
            vertices.push(c, c, c);
            // add normals
            vertices.push(ux, uy, uz);
            // add uv's
            vertices.push(u, v);
        }
    }

    // Generate the index buffer
    const numVertsAround = widthSegments + 1;
    for (let x = 0; x < widthSegments; x++) {
        for (let y = 0; y < heightSegments; y++) {
            // Make first triangle of the quad.
            indices.push(
                (y + 0) * numVertsAround + x + 1,
                (y + 0) * numVertsAround + x,
                (y + 1) * numVertsAround + x);
            // Make second triangle of the quad.
            indices.push(
                (y + 0) * numVertsAround + x + 1,
                (y + 1) * numVertsAround + x,
                (y + 1) * numVertsAround + x + 1);
        }
    }
    return { vertices, indices, stride }
}


function teapotGeometry() {

    var mesh = new obj_loader.Mesh(teapotobj);
    const vertices = [];
    const indices = mesh.indices;
    const stride = 11 * Float32Array.BYTES_PER_ELEMENT;

    for (let i = 0; i < mesh.vertices.length; i += 3) {
        // positions
        vertices.push(mesh.vertices[i], mesh.vertices[i + 1] - 1.0, mesh.vertices[i + 2]);
        // const gray colors
        vertices.push(0.5, 0.5, 0.5);
        // normals
        vertices.push(mesh.vertexNormals[i], mesh.vertexNormals[i + 1], mesh.vertexNormals[i + 2]);
        // fake tex
        vertices.push(0.0, 0.0);
    }

    return { vertices, indices, stride };
}

function importObj(objname) {

    var mesh = new obj_loader.Mesh(objname);
    const vertices = [];
    const indices = mesh.indices;
    const stride = 11 * Float32Array.BYTES_PER_ELEMENT;

    for (let i = 0; i < mesh.vertices.length; i += 3) {
        // positions
        vertices.push(mesh.vertices[i], mesh.vertices[i + 1], mesh.vertices[i + 2]);
        // const gray colors
        vertices.push(0.5, 0.5, 0.5);
        // normals
        vertices.push(mesh.vertexNormals[i], mesh.vertexNormals[i + 1], mesh.vertexNormals[i + 2]);
        // fake tex
        vertices.push(0.0, 0.0);
    }

    return { vertices, indices, stride };
}

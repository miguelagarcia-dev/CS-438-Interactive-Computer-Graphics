
// ----------------------------------------------------------------------------
function computeTangentSpace(geometry) {

    // assuming a stride of 11: v3, c3, n3, t2
    if (geometry.hasTangents === true) {
        return geometry;
    }

    let vertices = geometry.vertices;
    let indices = geometry.indices;
    let stride = (3 + 3 + 3 + 2 + 3) * Float32Array.BYTES_PER_ELEMENT;
    let edges = geometry.edges;
    let tangents = [];
    let frames = [];

    mesh(vertices, indices);
    const newverts = [];

    // append tangents to vertex buffer
    for (let i = 0, ii = 0; i < vertices.length; i += 11, ii += 1) {

        for (let j = 0; j < 11; j++) {
            newverts.push(vertices[i + j]);
        }
        newverts.push(tangents[ii][0], tangents[ii][1], tangents[ii][2]);
    }
    vertices = newverts;
    return { vertices, indices, frames, edges, stride, hasTangents: true };


    function mesh(vertices, indices) {
        const v = []; // per vertex position list  
        const c = []; // per vertex color list      
        const n = []; // per vertex normal list        
        const u = []; // per vertex uv list
        const t = []; // per vertex tangent space list
        const vi = []; // per vertex index list
        const tvi = []; // per triangle vertex index list        

        for (let i = 0, ii = 0; i < vertices.length; i += 11, ii++) {
            v.push(vec3(vertices[i + 0], vertices[i + 1], vertices[i + 2]));
            c.push(vec3(vertices[i + 3], vertices[i + 4], vertices[i + 5]));
            n.push(vec3(vertices[i + 6], vertices[i + 7], vertices[i + 8]));
            u.push(vec2(vertices[i + 9], vertices[i + 10]));
            // Start from a zero tangent accumulator so Task 2a controls computed-frame output.
            t.push(mat3(0));
            vi.push(ii);
        }

        for (let i = 0; i < indices.length; i += 3) {
            tvi.push([vi[indices[i]], vi[indices[i + 1]], vi[indices[i + 2]]]);
        }

        const vc = new Array(v.length).fill(0);
        for (let i = 0; i < tvi.length; i++) {

            // compute tangent frame for each vertex of the triangle ti
            const TV0 = computeTS(tvi[i][0], tvi[i][1], tvi[i][2]);
            const TV1 = computeTS(tvi[i][1], tvi[i][2], tvi[i][0]);
            const TV2 = computeTS(tvi[i][2], tvi[i][0], tvi[i][1]);

            // sum up tangent frames for each vertex
            t[tvi[i][0]] = add(t[tvi[i][0]], TV0);
            t[tvi[i][1]] = add(t[tvi[i][1]], TV1);
            t[tvi[i][2]] = add(t[tvi[i][2]], TV2);

            vc[tvi[i][0]]++;
            vc[tvi[i][1]]++;
            vc[tvi[i][2]]++;
        }

        for (let i = 0; i < t.length; i++) {
            t[i][0] = scale((1.0 / vc[i]), t[i][0]);
            t[i][1] = scale((1.0 / vc[i]), t[i][1]);
            // adjust handyness
            const dir = (dot(cross(t[i][0], t[i][1]), n[i]) > 0.0) ? 0 : 1;
            t[i][2] = normalize(cross(t[i][dir], t[i][1 - dir]));
        }



        const tt = t[0].map((col, i) => t.map(row => row[i]));
        frames = tangentFrameGeometry(v, tt[0], tt[1], tt[2]);
        tangents = tt[0];

        // -- solve the 2x2 linear equation to determine tangent and bi-tangent directions
        function computeTS(i0, i1, i2) {
            // triangles vertex positions
            const x0 = v[i0];
            const x1 = v[i1];
            const x2 = v[i2];

            // triangles uv's
            const uv0 = u[i0];
            const uv1 = u[i1];
            const uv2 = u[i2];

            // ************************************************************************
            // *** TODO_A3 : Task 2a: Per-Triangle Tangent Solve ***
            //
            // Implement the tangent-space solve for one triangle.
            // Use the position differences and uv differences to compute:
            // 1. the determinant of the uv system,
            // 2. the tangent direction T,
            // 3. the bitangent direction B.
            //
            // Return the result as a mat3 payload where:
            //   column 0 stores T,
            //   column 1 stores B,
            //   column 2 can stay [0,0,0] here.
            //
            // The starter code below is execution-safe on purpose:
            // it keeps the program running, but the tangent-space result will only be
            // correct on meshes that already ship with tangents, such as the cube.
            //
            // *** Begin code.

            // uv deltas is how much the texture coordinate changes from vertex 0 to vertex 1/2
            const duv1 = [uv1[0] - uv0[0], uv1[1] - uv0[1]];
            const duv2 = [uv2[0] - uv0[0], uv2[1] - uv0[1]];

            // position deltas are the two edge vectors of the triangle in model space
            const dx1 = add(x1, scale(-1, x0));
            const dx2 = add(x2, scale(-1, x0));

            // determinant of the 2x2 uv system will tells us how much the uv space is stretched almost
            // a near-zero detr means the triangle is degenerate in uv space, so we be aware pf that and against it
            const det = duv1[0] * duv2[1] - duv1[1] * duv2[0];
            const invDet = (Math.abs(det) > 1e-8) ? (1.0 / det) : 0.0;

            // the direction in model space that corresponds to increasing U in texture space is tangent t
            // derived by uv^-1 so T = (duv2.y * dx1 - duv1.y * dx2) / det
            const T = scale(invDet, add(scale(duv2[1], dx1), scale(-duv1[1], dx2)));

            // bitangent B is the direction corresponding to increasing V in texture space
            // so we get that B = (duv1.x * dx2 - duv2.x * dx1) / det
            const B = scale(invDet, add(scale(duv1[0], dx2), scale(-duv2[0], dx1)));

            // rcolumn 0 = T, column 1 = B, column 2 = [0,0,0] (filled in later)
            return mat3(T.concat(B, [0, 0, 0]));

            // *** End code.
            // ************************************************************************
        }

    }
}




function tangentFrameGeometry(v, t, b, n, s = 0.035) {
    let indices = [];
    let vertices = [];
    for (let i = 0, ii = 0; i < v.length; i++) {

        // offset the rendered tangent frames along normal
        let vi = v[i];        
        let ni = normalize(n[i]);
        let ti = normalize(t[i]);
        let bi = normalize(b[i]);

        bi = cross(ni,ti);
        vi = add(v[i], scale(0.005, ni));
        
        // blue color: normal            
        vertices.push(vi);  // vertex
        vertices.push(vec3(0, 0, 1));
        vertices.push(add(vi, scale(s, ni)));  // normal
        vertices.push(vec3(0, 0, 1)); // blue
        indices.push(ii++);
        indices.push(ii++);

        // red color: tangent
        vertices.push(vi);  // vertex
        vertices.push(vec3(1, 0, 0));
        vertices.push(add(vi, scale(s, ti)));  // tangent
        vertices.push(vec3(1, 0, 0)); // red
        indices.push(ii++);
        indices.push(ii++);

        // green color: bitangent
        vertices.push(vi);  // vertex
        vertices.push(vec3(0, 1, 0));
        vertices.push(add(vi, scale(s, bi)));   // bitangent
        vertices.push(vec3(0, 1, 0)); // green
        indices.push(ii++);
        indices.push(ii++);
    }
    vertices = flatten(vertices);
    const stride = 6 * Float32Array.BYTES_PER_ELEMENT;
    return { vertices, indices, stride };
}

// ----------------------------------------------------------------------------
// extract all edges and draw the wire-frame. 
function getEdges(indices) {

    console.assert(indices !== undefined);

    const edges = [];
    for (let i = 0; i < indices.length; i += 3) {
        edges.push(indices[i]);
        edges.push(indices[i + 1]);
        edges.push(indices[i + 1]);
        edges.push(indices[i + 2]);
        edges.push(indices[i + 2]);
        edges.push(indices[i]);
    }
    return edges;
}


// ----------------------------------------------------------------------------
function quadGeometry() {

    let vertices = [
        // positions           // colors      // normal       // uv          // tangent
        vec3(-1, -1, 0), vec3(0, 0, 1), vec3(0, 0, 1), vec2(0.0, 0.0), vec3(1, 0, 0),   // bottom left, blue
        vec3(+1, -1, 0), vec3(0, 1, 0), vec3(0, 0, 1), vec2(1.0, 0.0), vec3(1, 0, 0),   // bottom right, green
        vec3(+1, +1, 0), vec3(1, 0, 0), vec3(0, 0, 1), vec2(1.0, 1.0), vec3(1, 0, 0),   // top right, red              
        vec3(-1, +1, 0), vec3(1, 1, 0), vec3(0, 0, 1), vec2(0.0, 1.0), vec3(1, 0, 0)    // top left, yellow
    ];
    const indices = [0, 1, 2, 0, 2, 3];
    const edges = getEdges(indices);
    const stride = 14 * Float32Array.BYTES_PER_ELEMENT;

    let v = [], t = [], n = [], b = [];
    for (let i = 0; i < vertices.length; i += 5) {
        v.push(vertices[i]);
        let tt = vec3(1, 0, 0);
        let bb = vec3(0, 1, 0); //cross(tt, nn);
        let nn = vec3(0, 0, 1);
        t.push(tt);
        n.push(nn);
        b.push(bb);
    }
    const frames = tangentFrameGeometry(v, t, b, n);

    vertices = flatten(vertices);
    return { vertices, indices, edges, stride, frames, hasTangents: true };
}

// ----------------------------------------------------------------------------
function coordinateFrame() {
    const vertices = flatten([
        vec3(-0.25, 0, 0), vec3(1, 0, 0),
        vec3(+1.0, 0, 0), vec3(1, 0, 0),
        vec3(0, -0.25, 0), vec3(0, 1, 0),
        vec3(0, +1.0, 0), vec3(0, 1, 0),
        vec3(0, 0, -0.25), vec3(0, 0, 1),
        vec3(0, 0, +1.0), vec3(0, 0, 1),
    ]);
    const indices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const stride = 6 * Float32Array.BYTES_PER_ELEMENT;
    return { vertices, indices, stride };
}


// ----------------------------------------------------------------------------
function circleGeometry(segments = 12, radius = 1.0) {

    var pi2 = 2 * Math.PI;
    var step = pi2 / segments;
    var vertices = [];

    points.push(vec3(0.0, 0.0, 0.0));
    colors.push(vec3(1.0, 1.0, 1.0));

    for (var i = 0; i < segments + 1; i++) {
        var v = vec3(radius * Math.cos(i * step), radius * Math.sin(i * step), 0.0);
        vertices.push(v);
        var hue = (i * step) / pi2;
        vertices.push(hsvToRgb(hue, 1, 1));
    }
    return { vertices };
}

// ----------------------------------------------------------------------------
// Generates a uv-cube geometry for a given number of segments.
function cubeGeometry() {
    const vertices = [
        // Front face: white        
        -1.0, -1.0, 1.0, /* */  1.0, 1.0, 1.0, /* */    0.0, 0.0, 1.0,  /* */   0.0, 0.0, /* */  1, 0, 0,
        +1.0, -1.0, 1.0, /* */  1.0, 1.0, 1.0, /* */    0.0, 0.0, 1.0,  /* */   1.0, 0.0, /* */  1, 0, 0,
        +1.0, +1.0, 1.0, /* */  1.0, 1.0, 1.0, /* */    0.0, 0.0, 1.0,  /* */   1.0, 1.0, /* */  1, 0, 0,
        -1.0, +1.0, 1.0, /* */  1.0, 1.0, 1.0, /* */    0.0, 0.0, 1.0,  /* */   0.0, 1.0, /* */  1, 0, 0,

        // Back face: red
        -1.0, -1.0, -1.0, /* */  1.0, 0.0, 0.0, /* */   0.0, 0.0, -1.0, /* */  1.0, 0.0, /* */  -1, 0, 0,
        -1.0, +1.0, -1.0, /* */  1.0, 0.0, 0.0, /* */   0.0, 0.0, -1.0, /* */  1.0, 1.0, /* */  -1, 0, 0,
        +1.0, +1.0, -1.0, /* */  1.0, 0.0, 0.0, /* */   0.0, 0.0, -1.0, /* */  0.0, 1.0, /* */  -1, 0, 0,
        +1.0, -1.0, -1.0, /* */  1.0, 0.0, 0.0, /* */   0.0, 0.0, -1.0, /* */  0.0, 0.0, /* */  -1, 0, 0,

        // Top face: green
        -1.0, 1.0, -1.0, /* */  1.0, 0.0, 0.0,  /* */  0.0, 1.0, 0.0, /* */  0.0, 1.0,  /* */   1, 0, 0,
        -1.0, 1.0, +1.0, /* */  0.0, 1.0, 0.0,  /* */  0.0, 1.0, 0.0, /* */  0.0, 0.0,  /* */   1, 0, 0,
        +1.0, 1.0, +1.0, /* */  0.0, 0.0, 1.0,  /* */  0.0, 1.0, 0.0, /* */  1.0, 0.0,  /* */   1, 0, 0,
        +1.0, 1.0, -1.0, /* */  0.0, 0.0, 0.0,  /* */  0.0, 1.0, 0.0, /* */  1.0, 1.0,  /* */   1, 0, 0,

        // Bottom face: blue
        -1.0, -1.0, -1.0, /* */  0.0, 0.0, 1.0,  /* */ 0.0, -1.0, 0.0,  /* */ 0.0, 0.0,  /* */  1, 0, 0,
        +1.0, -1.0, -1.0, /* */  0.0, 0.0, 1.0,  /* */ 0.0, -1.0, 0.0,  /* */ 1.0, 0.0,  /* */  1, 0, 0,
        +1.0, -1.0, +1.0, /* */  0.0, 0.0, 1.0,  /* */ 0.0, -1.0, 0.0,  /* */ 1.0, 1.0,  /* */  1, 0, 0,
        -1.0, -1.0, +1.0,  /* */ 0.0, 0.0, 1.0,  /* */ 0.0, -1.0, 0.0,  /* */ 0.0, 1.0,  /* */  1, 0, 0,

        // Right face: yellow
        1.0, -1.0, -1.0,  /* */   1.0, 1.0, 0.0,  /* */   1.0, 0.0, 0.0,  /* */   1.0, 0.0,  /* */   0, 0, -1,
        1.0, +1.0, -1.0,  /* */   1.0, 1.0, 0.0,  /* */   1.0, 0.0, 0.0,  /* */   1.0, 1.0,  /* */   0, 0, -1,
        1.0, +1.0, +1.0,  /* */   1.0, 1.0, 0.0,  /* */   1.0, 0.0, 0.0,  /* */   0.0, 1.0,  /* */   0, 0, -1,
        1.0, -1.0, +1.0,  /* */   1.0, 1.0, 0.0,  /* */   1.0, 0.0, 0.0,  /* */   0.0, 0.0,  /* */   0, 0, -1,

        // Left face: purple
        -1.0, -1.0, -1.0,  /* */   1.0, 0.0, 1.0,  /* */   -1.0, 0.0, 0.0,  /* */   0.0, 0.0,  /* */   0, 0, 1,
        -1.0, -1.0, +1.0,  /* */   1.0, 0.0, 1.0,  /* */   -1.0, 0.0, 0.0,  /* */   1.0, 0.0,  /* */   0, 0, 1,
        -1.0, +1.0, +1.0,  /* */   1.0, 0.0, 1.0,  /* */   -1.0, 0.0, 0.0,  /* */   1.0, 1.0,  /* */   0, 0, 1,
        -1.0, +1.0, -1.0,  /* */   1.0, 0.0, 1.0,  /* */   -1.0, 0.0, 0.0,  /* */   0.0, 1.0,  /* */   0, 0, 1
    ];

    const indices = [
        0, 1, 2, 0, 2, 3, // front
        4, 5, 6, 4, 6, 7, // back
        8, 9, 10, 8, 10, 11, // top
        12, 13, 14, 12, 14, 15, // bottom
        16, 17, 18, 16, 18, 19, // right
        20, 21, 22, 20, 22, 23, // left
    ];

    let vv = [], tt = [], nn = [], bb = [];
    for (let i = 0; i < vertices.length; i += 14) {
        vv.push([vertices[i], vertices[i + 1], vertices[i + 2]]);
        tt.push([vertices[i + 11], vertices[i + 12], vertices[i + 13]]);
        nn.push([vertices[i + 6], vertices[i + 7], vertices[i + 8]]);
        bb.push(cross([vertices[i + 11], vertices[i + 12], vertices[i + 13]], [vertices[i + 6], vertices[i + 7], vertices[i + 8]]));
    }
    const frames = tangentFrameGeometry(vv, tt, bb, nn);

    const edges = getEdges(indices);
    const stride = 14 * Float32Array.BYTES_PER_ELEMENT;
    return { vertices, indices, edges, frames, stride, hasTangents: true };
}

// ----------------------------------------------------------------------------
// Generates a uv-sphere geometry for a given number of segments. 
function sphereGeometry(heightSegments = 12, widthSegments = 24, radius = 1.0, flip = 1) {

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
            const u = (x / widthSegments);
            const v = (y / heightSegments);
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
            // add colors
            vertices.push(0.3, 0.3, 0.3);
            // add normals            
            vertices.push(flip * ux / radius, flip * uy / radius, flip * uz / radius);
            // add uv's
            vertices.push(1 - u, 1 - v);
        }
    }

    // Generate the index buffer
    const numVertsAround = widthSegments + 1;
    for (let x = 0; x < widthSegments; x++) {
        for (let y = 0; y < heightSegments; y++) {

            if (flip > 0) {
                // Make first triangle of the quad.
                indices.push(
                    (y + 0) * numVertsAround + x,
                    (y + 0) * numVertsAround + x + 1,
                    (y + 1) * numVertsAround + x);
                // Make second triangle of the quad.
                indices.push(
                    (y + 1) * numVertsAround + x,
                    (y + 0) * numVertsAround + x + 1,
                    (y + 1) * numVertsAround + x + 1);
            }
            else {
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
    }

    const edges = getEdges(indices);
    return { vertices, indices, edges, stride }
}


function teapotGeometry() {

    const mesh = teapotModel;
    const vertices = [];
    const indices = mesh.indices;
    const stride = 11 * Float32Array.BYTES_PER_ELEMENT;

    let ii = 0;
    let s = 0.1;
    for (let i = 0; i < mesh.vertexPositions.length; i += 3, ii += 2) {
        // positions
        vertices.push(s * mesh.vertexPositions[i], s * mesh.vertexPositions[i + 1], s * mesh.vertexPositions[i + 2]);
        // const gray colors per vertex
        vertices.push(0.5, 0.5, 0.5);
        // normals per vertex
        vertices.push(mesh.vertexNormals[i], mesh.vertexNormals[i + 1], mesh.vertexNormals[i + 2]);
        // texture coordinates per vertex        
        vertices.push(mesh.vertexTextureCoords[ii], mesh.vertexTextureCoords[ii + 1]);
    }

    const edges = getEdges(indices);
    return { vertices, indices, edges, stride };
}


function importObj(objname) {

    var mesh = new obj_loader.Mesh(objname);
    const vertices = [];
    const indices = mesh.indices;
    const stride = 11 * Float32Array.BYTES_PER_ELEMENT;



    for (let i = 0, ii = 0; i < mesh.vertices.length; i += 3, ii += 2) {
        // positions
        vertices.push(mesh.vertices[i], mesh.vertices[i + 1], mesh.vertices[i + 2]);
        // const gray colors
        vertices.push(0.5, 0.5, 0.5);
        // normals
        if (mesh.vertexNormals != undefined)
            vertices.push(mesh.vertexNormals[i], mesh.vertexNormals[i + 1], mesh.vertexNormals[i + 2]);
        else
            vertices.push(0, 0, 1); // fake normal

        if (mesh.textures != undefined)
            vertices.push(mesh.textures[ii], mesh.textures[ii + 1])
        else
            vertices.push(0.0, 0.0);// fake tex
    }

    const edges = getEdges(indices);
    return { vertices, indices, edges, stride };
}

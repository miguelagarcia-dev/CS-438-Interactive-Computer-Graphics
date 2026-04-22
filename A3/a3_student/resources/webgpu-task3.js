"use strict";

let task3WebGPUPreviewHandle = null;
let task3WgslSourcePromise = null;
const A3_STUDENT_LABEL = "WebGPU A3 Student";
const A3_MSAA_SAMPLE_COUNT = 4;

async function loadTask3WgslSource() {
    if (!task3WgslSourcePromise) {
        task3WgslSourcePromise = fetch("./resources/webgpu-task3.wgsl", { cache: "no-store" }).then(function (response) {
            if (!response.ok) {
                throw new Error("Failed to load webgpu-task3.wgsl (status " + response.status + ")");
            }
            return response.text();
        });
    }
    return task3WgslSourcePromise;
}

function normalizeGeometry(geometry) {
    if (!geometry || !geometry.vertices || !geometry.indices) {
        throw new Error("Invalid geometry payload.");
    }
    if (geometry.hasTangents === true) {
        return geometry;
    }
    return computeTangentSpace(geometry);
}

function buildGeometryByName(meshName, res) {
    switch (meshName) {
        case "quad":
            return normalizeGeometry(quadGeometry());
        case "cube":
            return normalizeGeometry(cubeGeometry());
        case "teapot":
            return normalizeGeometry(teapotGeometry());
        case "head":
            return normalizeGeometry(importObj(head2));
        case "bunny":
            return normalizeGeometry(importObj(bunnyobj_pvn));
        case "sphere":
        default:
            return normalizeGeometry(sphereGeometry(5 * res, 10 * res));
    }
}

function createMaterialSnapshot(material) {
    if (!material) {
        return {
            ka: [0.1, 0.1, 0.1],
            kd: [0.7, 0.4, 0.2],
            ks: [0.4, 0.4, 0.4],
            qs: 20.0,
            diffPath: null,
            normPath: null
        };
    }

    return {
        ka: toVec3orFallback(material.ka, [0.1, 0.1, 0.1]),
        kd: toVec3orFallback(material.kd, [0.7, 0.4, 0.2]),
        ks: toVec3orFallback(material.ks, [0.4, 0.4, 0.4]),
        qs: Number.isFinite(Number(material.qs)) ? Number(material.qs) : 20.0,
        diffPath: material.diffPath || null,
        normPath: material.normPath || null
    };
}

function createGlobalsData(modelView, proj, normalMat, lightPosVS, lightCol, material, modeX, modeZ, modeW) {
    const data = new Float32Array(76);
    let offset = 0;
    const mat = createMaterialSnapshot(material);

    data.set(flatten(modelView), offset); offset += 16;
    data.set(flatten(proj), offset); offset += 16;
    data.set(flatten(normalMat), offset); offset += 16;

    data.set(lightPosVS || [0, 0, 3, 1], offset); offset += 4;
    data.set(lightCol || [1, 1, 1, 1], offset); offset += 4;
    data.set([mat.ka[0], mat.ka[1], mat.ka[2], 1], offset); offset += 4;
    data.set([mat.kd[0], mat.kd[1], mat.kd[2], 1], offset); offset += 4;
    data.set([mat.ks[0], mat.ks[1], mat.ks[2], 1], offset); offset += 4;
    data.set([mat.qs, 0, 0, 0], offset); offset += 4;
    data.set([modeX || 0, 0, modeZ || 0, modeW || 0], offset);

    return data;
}

function toVec3orFallback(value, fallback) {
    if (!value || value.length < 3) return fallback.slice(0, 3);
    return [Number(value[0]), Number(value[1]), Number(value[2])];
}

function ensureRenderTargets(state) {
    const w = Math.max(1, state.canvas.width);
    const h = Math.max(1, state.canvas.height);

    if (
        state.msaaColorTexture &&
        state.depthTexture &&
        state.renderTargetSize &&
        state.renderTargetSize[0] === w &&
        state.renderTargetSize[1] === h
    ) {
        return;
    }

    if (state.msaaColorTexture) {
        state.msaaColorTexture.destroy();
    }
    if (state.depthTexture) {
        state.depthTexture.destroy();
    }

    state.msaaColorTexture = state.device.createTexture({
        size: [w, h, 1],
        sampleCount: state.msaaSampleCount,
        format: state.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
        label: "A3-Student-MsaaColorTexture"
    });

    state.depthTexture = state.device.createTexture({
        size: [w, h, 1],
        sampleCount: state.msaaSampleCount,
        format: "depth24plus",
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
        label: "A3-Student-DepthTexture"
    });
    state.renderTargetSize = [w, h];
}

function createFallbackDiffuseTexture(device) {
    const texture = device.createTexture({
        label: "A3-Student-FallbackDiffuseTexture",
        size: [1, 1, 1],
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    device.queue.writeTexture(
        { texture: texture },
        new Uint8Array([0, 0, 255, 255]),
        { bytesPerRow: 4 },
        [1, 1, 1]
    );
    return {
        texture: texture,
        view: texture.createView(),
        mipLevelCount: 1,
        isPowerOf2: true
    };
}

function createFallbackNormalTexture(device) {
    const texture = device.createTexture({
        label: "A3-Student-FallbackNormalTexture",
        size: [1, 1, 1],
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    // Tangent-space +Z normal encoded in [0,1].
    device.queue.writeTexture(
        { texture: texture },
        new Uint8Array([128, 128, 255, 255]),
        { bytesPerRow: 4 },
        [1, 1, 1]
    );
    return {
        texture: texture,
        view: texture.createView(),
        mipLevelCount: 1,
        isPowerOf2: true
    };
}

function isPowerOf2(value) {
    return value > 0 && (value & (value - 1)) === 0;
}

function loadImage(path) {
    return new Promise(function (resolve, reject) {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = function () {
            resolve(image);
        };
        image.onerror = function () {
            reject(new Error("Failed to decode diffuse texture " + path));
        };
        image.src = path;
    });
}

function createMipCanvases(image) {
    const levels = [];
    let width = image.width;
    let height = image.height;
    let source = image;

    while (true) {
        const canvas = typeof OffscreenCanvas !== "undefined"
            ? new OffscreenCanvas(width, height)
            : document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(source, 0, 0, width, height);
        levels.push(canvas);

        if (width === 1 && height === 1) {
            break;
        }

        source = canvas;
        width = Math.max(1, Math.floor(width / 2));
        height = Math.max(1, Math.floor(height / 2));
    }

    return levels;
}

function getSamplerDescriptor(glMinFilter, glMagFilter, wrapMode) {
    const minKey = String(glMinFilter || 9987);
    const magKey = String(glMagFilter || 9729);
    const addressMode = wrapMode === "repeat" ? "repeat" : "clamp-to-edge";

    const minMap = {
        "9728": { minFilter: "nearest", mipmapFilter: "nearest" },
        "9729": { minFilter: "linear", mipmapFilter: "nearest" },
        "9984": { minFilter: "nearest", mipmapFilter: "nearest" },
        "9985": { minFilter: "linear", mipmapFilter: "nearest" },
        "9986": { minFilter: "nearest", mipmapFilter: "linear" },
        "9987": { minFilter: "linear", mipmapFilter: "linear" }
    };

    return {
        minFilter: (minMap[minKey] || minMap["9987"]).minFilter,
        mipmapFilter: (minMap[minKey] || minMap["9987"]).mipmapFilter,
        magFilter: magKey === "9728" ? "nearest" : "linear",
        addressModeU: addressMode,
        addressModeV: addressMode
    };
}

function makeMeshKey(meshName, res) {
    if (meshName === "sphere") {
        return "sphere|res=" + res;
    }
    return meshName;
}

function createIndexData(indices) {
    // Accept Array + typed arrays + generic array-like values.
    // Preserve Uint16/Uint32 directly when possible (no lossy conversion).
    if (indices instanceof Uint16Array) {
        return { typed: indices, format: "uint16", count: indices.length };
    }
    if (indices instanceof Uint32Array) {
        return { typed: indices, format: "uint32", count: indices.length };
    }

    if (indices == null) {
        return { typed: new Uint16Array(0), format: "uint16", count: 0 };
    }

    let list = null;
    if (Array.isArray(indices)) {
        list = indices;
    } else if (ArrayBuffer.isView(indices) || typeof indices.length === "number") {
        try {
            list = Array.from(indices);
        } catch (error) {
            list = null;
        }
    }

    if (!list || list.length === 0) {
        return { typed: new Uint16Array(0), format: "uint16", count: 0 };
    }

    const normalized = new Array(list.length);
    let maxIndex = 0;
    for (let i = 0; i < list.length; i++) {
        const numeric = Number(list[i]);
        // Mimic WebGL typed-array ingestion behavior for invalid values.
        const indexValue = Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
        normalized[i] = indexValue;
        if (indexValue > maxIndex) {
            maxIndex = indexValue;
        }
    }

    const format = maxIndex > 65535 ? "uint32" : "uint16";
    const typed = format === "uint32" ? new Uint32Array(normalized) : new Uint16Array(normalized);
    return { typed: typed, format: format, count: typed.length };
}

function createGpuMeshFromGeometry(device, geometry, key) {
    const vertices = new Float32Array(geometry.vertices);
    const triangleIndexData = createIndexData(geometry.indices);
    const edgeIndexData = createIndexData(geometry.edges);
    const frameVertices = geometry.frames && geometry.frames.vertices
        ? new Float32Array(geometry.frames.vertices)
        : null;
    const frameIndexData = createIndexData(geometry.frames && geometry.frames.indices);

    const vertexBuffer = device.createBuffer({
        label: "A3-Student-VertexBuffer-" + key,
        size: vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(vertexBuffer, 0, vertices);

    let indexBuffer = null;
    if (triangleIndexData.count > 0) {
        indexBuffer = device.createBuffer({
            label: "A3-Student-IndexBuffer-" + key,
            size: triangleIndexData.typed.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(indexBuffer, 0, triangleIndexData.typed);
    }

    let edgeIndexBuffer = null;
    if (edgeIndexData.count > 0) {
        edgeIndexBuffer = device.createBuffer({
            label: "A3-Student-EdgeIndexBuffer-" + key,
            size: edgeIndexData.typed.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(edgeIndexBuffer, 0, edgeIndexData.typed);
    }

    let frameVertexBuffer = null;
    if (frameVertices && frameVertices.byteLength > 0) {
        frameVertexBuffer = device.createBuffer({
            label: "A3-Student-FrameVertexBuffer-" + key,
            size: frameVertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(frameVertexBuffer, 0, frameVertices);
    }

    let frameIndexBuffer = null;
    if (frameIndexData.count > 0) {
        frameIndexBuffer = device.createBuffer({
            label: "A3-Student-FrameIndexBuffer-" + key,
            size: frameIndexData.typed.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(frameIndexBuffer, 0, frameIndexData.typed);
    }

    return {
        key,
        vertexBuffer,
        indexBuffer,
        indexCount: triangleIndexData.count,
        indexFormat: triangleIndexData.format,
        edgeIndexBuffer: edgeIndexBuffer,
        edgeIndexCount: edgeIndexData.count,
        edgeIndexFormat: edgeIndexData.format,
        frameVertexBuffer: frameVertexBuffer,
        frameIndexBuffer: frameIndexBuffer,
        frameIndexCount: frameIndexData.count,
        frameIndexFormat: frameIndexData.format,
    };
}

// -----------------------------------------------------------------------------
// Core WebGPU runtime.
async function runTask3WebGPUPreview(canvas, statusElem) {
    const init = await wgpuInitCanvasContext(canvas, statusElem, A3_STUDENT_LABEL);
    if (!init) {
        return { ready: false };
    }

    const device = init.device;
    const context = init.context;
    const format = init.format;

    const wgslSource = await loadTask3WgslSource();
    const shaderModule = device.createShaderModule({
        label: "A3-Student-ShaderModule",
        code: wgslSource
    });

    // Keep separate uniform buffers for fill and overlay line passes.
    // This avoids uniform overwrite hazards when multiple passes are encoded
    // before a single queue submit (WebGPU behavior differs from immediate-mode WebGL uniforms).
    const uniformBuffers = [0, 1, 2, 3, 4, 5].map(function (i) {
        return device.createBuffer({
            label: "A3-Student-Globals-" + i,
            size: 76 * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
    });

    const bindGroupLayout = device.createBindGroupLayout({
        label: "A3-Student-BindGroupLayout",
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: "uniform" }
            },
            {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "filtering" }
            },
            {
                binding: 2,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "float" }
            },
            {
                binding: 3,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "filtering" }
            },
            {
                binding: 4,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "float" }
            }
        ]
    });

    const pipelineLayout = device.createPipelineLayout({
        label: "A3-Student-PipelineLayout",
        bindGroupLayouts: [bindGroupLayout]
    });

    const pipelineCache = new Map();
    function getOrCreateMeshPipeline(depthEnabled, cullFace, frontFace) {
        if (cullFace === "both") {
            return null;
        }

        const resolvedCull = (cullFace === "front" || cullFace === "back") ? cullFace : "none";
        const resolvedFront = frontFace === "cw" ? "cw" : "ccw";
        const resolvedDepth = !!depthEnabled;
        const key = (resolvedDepth ? "depthOn" : "depthOff") + "|" + resolvedCull + "|" + resolvedFront;

        if (pipelineCache.has(key)) {
            return pipelineCache.get(key);
        }

        const pipeline = device.createRenderPipeline({
            label: "A3-Student-MeshPipeline|" + key,
            layout: pipelineLayout,
            vertex: {
                module: shaderModule,
                entryPoint: "vs_main",
                buffers: [{
                    arrayStride: 14 * Float32Array.BYTES_PER_ELEMENT,
                    attributes: [
                    { shaderLocation: 0, offset: 0, format: "float32x3" },
                    { shaderLocation: 1, offset: 3 * Float32Array.BYTES_PER_ELEMENT, format: "float32x3" },
                    { shaderLocation: 2, offset: 6 * Float32Array.BYTES_PER_ELEMENT, format: "float32x3" },
                    { shaderLocation: 3, offset: 9 * Float32Array.BYTES_PER_ELEMENT, format: "float32x2" },
                    { shaderLocation: 4, offset: 11 * Float32Array.BYTES_PER_ELEMENT, format: "float32x3" }
                ]
            }]
        },
            fragment: {
                module: shaderModule,
                entryPoint: "fs_main",
                targets: [{ format }]
            },
            primitive: {
                topology: "triangle-list",
                cullMode: resolvedCull,
                frontFace: resolvedFront
            },
            depthStencil: {
                format: "depth24plus",
                depthWriteEnabled: resolvedDepth,
                depthCompare: resolvedDepth ? "less" : "always"
            },
            multisample: {
                count: A3_MSAA_SAMPLE_COUNT
            }
        });

        pipelineCache.set(key, pipeline);
        return pipeline;
    }

    const wirePipelineCache = new Map();
    function getOrCreateWirePipeline(depthEnabled) {
        const resolvedDepth = !!depthEnabled;
        const key = resolvedDepth ? "depthOn" : "depthOff";
        if (wirePipelineCache.has(key)) {
            return wirePipelineCache.get(key);
        }

        const pipeline = device.createRenderPipeline({
            label: "A3-Student-WirePipeline|" + key,
            layout: pipelineLayout,
            vertex: {
                module: shaderModule,
                entryPoint: "vs_main",
                buffers: [{
                    arrayStride: 14 * Float32Array.BYTES_PER_ELEMENT,
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: "float32x3" },
                        { shaderLocation: 1, offset: 3 * Float32Array.BYTES_PER_ELEMENT, format: "float32x3" },
                        { shaderLocation: 2, offset: 6 * Float32Array.BYTES_PER_ELEMENT, format: "float32x3" },
                        { shaderLocation: 3, offset: 9 * Float32Array.BYTES_PER_ELEMENT, format: "float32x2" },
                        { shaderLocation: 4, offset: 11 * Float32Array.BYTES_PER_ELEMENT, format: "float32x3" }
                    ]
                }]
            },
            fragment: {
                module: shaderModule,
                entryPoint: "fs_main",
                targets: [{ format }]
            },
            primitive: {
                topology: "line-list",
                cullMode: "none",
                frontFace: "ccw"
            },
            depthStencil: {
                format: "depth24plus",
                // Match WebGL line overlay semantics as closely as possible:
                // lines run under the same depth-test toggle and write depth when enabled.
                depthWriteEnabled: resolvedDepth,
                depthCompare: resolvedDepth ? "less" : "always"
            },
            multisample: {
                count: A3_MSAA_SAMPLE_COUNT
            }
        });

        wirePipelineCache.set(key, pipeline);
        return pipeline;
    }

    const framePipelineCache = new Map();
    function getOrCreateFramePipeline(depthEnabled) {
        const resolvedDepth = !!depthEnabled;
        const key = resolvedDepth ? "depthOn" : "depthOff";
        if (framePipelineCache.has(key)) {
            return framePipelineCache.get(key);
        }

        const pipeline = device.createRenderPipeline({
            label: "A3-Student-FramePipeline|" + key,
            layout: pipelineLayout,
            vertex: {
                module: shaderModule,
                entryPoint: "vs_frame",
                buffers: [{
                    arrayStride: 6 * Float32Array.BYTES_PER_ELEMENT,
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: "float32x3" },
                        { shaderLocation: 1, offset: 3 * Float32Array.BYTES_PER_ELEMENT, format: "float32x3" }
                    ]
                }]
            },
            fragment: {
                module: shaderModule,
                entryPoint: "fs_main",
                targets: [{ format }]
            },
            primitive: {
                topology: "line-list",
                cullMode: "none",
                frontFace: "ccw"
            },
            depthStencil: {
                format: "depth24plus",
                depthWriteEnabled: resolvedDepth,
                depthCompare: resolvedDepth ? "less" : "always"
            },
            multisample: {
                count: A3_MSAA_SAMPLE_COUNT
            }
        });

        framePipelineCache.set(key, pipeline);
        return pipeline;
    }

    const fallbackDiffuse = createFallbackDiffuseTexture(device);
    const fallbackNormal = createFallbackNormalTexture(device);
    const defaultSceneMaterial = createMaterialSnapshot({
        ka: [0.1, 0.1, 0.1],
        kd: [0.5, 0.5, 0.5],
        ks: [0.2, 0.2, 0.2],
        qs: 2.0,
        diffPath: "./texture/checker1.jpg",
        normPath: "./texture/bump_normal.png"
    });
    const defaultViewMatrix = lookAt(vec3(0, 0, 3), vec3(0, 0, 0), vec3(0, 1, 0));
    const defaultProjMatrix = perspective(60.0, canvas.width / canvas.height, 0.1, 100.0);

    const state = {
        device,
        context,
        canvas,
        statusElem,
        uniformBuffers,
        bindGroupLayout,
        format,
        msaaSampleCount: A3_MSAA_SAMPLE_COUNT,
        msaaColorTexture: null,
        depthTexture: null,
        renderTargetSize: null,
        meshCache: new Map(),
        diffuseTextureCache: new Map(),
        normalTextureCache: new Map(),
        samplerCache: new Map(),
        materialBindGroupCache: new Map(),
        fallbackDiffuse,
        fallbackNormal,
        scene: {
            viewMatrix: defaultViewMatrix,
            projMatrix: defaultProjMatrix,
            timings: { day: 0, month: 0, year: 0, sunday: 0 },
            sunMatrix: null,
            earthMatrix: null,
            moonMatrix: null,
            obj1Mesh: "sphere",
            obj2Mesh: "sphere",
            obj3Mesh: "sphere",
            res: 2,
            drawObj1: true,
            drawObj2: true,
            drawObj3: true,
            drawBulb: true,
            drawFrame: false,
            drawWire: false,
            clearColor: [0.9, 0.9, 0.9, 1.0],
            depthEnabled: true,
            cullFace: "none",
            frontFace: "ccw",
            shadingMode: 1,
            diffuseMapEnabled: true,
            normalMapEnabled: false,
            diffMinFilter: "9728",
            diffMagFilter: "9728",
            normMinFilter: "9728",
            normMagFilter: "9728",
            obj1Material: defaultSceneMaterial,
            obj2Material: defaultSceneMaterial,
            obj3Material: defaultSceneMaterial,
            lightModelMatrix: null,
            lightPosVS: [0, 0, 3, 1],
            lightCol: [1, 1, 1, 1]
        }
    };

    function updateGlobalsForModel(modelMatrix, uniformBuffer, material, modeX, modeZ, modeW, modeYOverride) {
        const view = state.scene.viewMatrix;
        const proj = state.scene.projMatrix;
        const modelView = mult(view, modelMatrix);
        const normalMat = transpose(inverse(modelView));

        const lightPos = toVec3orFallback(state.scene.lightPosVS, [0, 0, 3]);
        const lightCol = toVec3orFallback(state.scene.lightCol, [1, 1, 1]);
        const mode = modeYOverride === undefined || modeYOverride === null
            ? Number(state.scene.shadingMode || 0)
            : Number(modeYOverride);
        const modeY = Number.isFinite(mode) ? mode : 0;
        const globals = createGlobalsData(
            modelView,
            proj,
            normalMat,
            [lightPos[0], lightPos[1], lightPos[2], 1.0],
            [lightCol[0], lightCol[1], lightCol[2], 1.0],
            material,
            modeX,
            modeZ,
            modeW
        );
        globals[73] = modeY; // u_mode.y = shading mode
        state.device.queue.writeBuffer(uniformBuffer, 0, globals);
    }

    function getOrCreateGpuMesh(meshName, res) {
        const key = makeMeshKey(meshName, res);
        if (state.meshCache.has(key)) {
            return state.meshCache.get(key);
        }

        const geometry = buildGeometryByName(meshName, res);
        const gpuMesh = createGpuMeshFromGeometry(state.device, geometry, key);
        state.meshCache.set(key, gpuMesh);
        return gpuMesh;
    }

    function setSceneState(scenePatch) {
        if (!scenePatch) return;

        state.scene = Object.assign({}, state.scene, scenePatch);

        if (scenePatch.timings) {
            state.scene.timings = Object.assign({}, state.scene.timings, scenePatch.timings);
        }
    }

    function primeGeometry(meshName, res) {
        try {
            getOrCreateGpuMesh(meshName, res);
            state.scene.obj1Mesh = meshName;
            state.scene.res = res;
            wgpuSetStatus(statusElem, A3_STUDENT_LABEL + " ready: geometry '" + meshName + "' loaded.", "ok");
            return true;
        } catch (error) {
            console.warn("[" + A3_STUDENT_LABEL + "] geometry warning:", error);
            wgpuSetStatus(statusElem, A3_STUDENT_LABEL + " geometry warning: " + String(error), "warn");
            return false;
        }
    }

    function ensureDiffuseTexture(path) {
        if (!path) {
            return {
                status: "missing",
                view: state.fallbackDiffuse.view,
                mipLevelCount: 1,
                isPowerOf2: state.fallbackDiffuse.isPowerOf2
            };
        }

        if (state.diffuseTextureCache.has(path)) {
            return state.diffuseTextureCache.get(path);
        }

        const record = {
            status: "loading",
            texture: state.fallbackDiffuse.texture,
            view: state.fallbackDiffuse.view,
            mipLevelCount: 1,
            isPowerOf2: state.fallbackDiffuse.isPowerOf2,
            promise: null
        };
        state.diffuseTextureCache.set(path, record);

        record.promise = loadImage(path)
            .then(function (image) {
                const useMipmaps = isPowerOf2(image.width) && isPowerOf2(image.height);
                const mipSources = useMipmaps ? createMipCanvases(image) : [image];
                const width = mipSources[0].width;
                const height = mipSources[0].height;
                const texture = device.createTexture({
                    label: "A3-Student-DiffuseTexture-" + path,
                    size: [width, height, 1],
                    mipLevelCount: mipSources.length,
                    format: "rgba8unorm",
                    usage: GPUTextureUsage.TEXTURE_BINDING |
                        GPUTextureUsage.COPY_DST |
                        GPUTextureUsage.RENDER_ATTACHMENT
                });

                mipSources.forEach(function (sourceLevel, level) {
                    const levelWidth = sourceLevel.width;
                    const levelHeight = sourceLevel.height;
                    device.queue.copyExternalImageToTexture(
                        { source: sourceLevel, flipY: true },
                        { texture: texture, mipLevel: level },
                        [levelWidth, levelHeight, 1]
                    );
                });

                record.texture = texture;
                record.view = texture.createView();
                record.mipLevelCount = mipSources.length;
                record.isPowerOf2 = useMipmaps;
                record.status = "ready";
                renderOnce();
                return record;
            })
            .catch(function (error) {
                console.warn("[" + A3_STUDENT_LABEL + "] diffuse texture warning:", error);
                record.status = "failed";
                return record;
            });

        return record;
    }

    function ensureNormalTexture(path) {
        if (!path) {
            return {
                status: "missing",
                view: state.fallbackNormal.view,
                mipLevelCount: 1,
                isPowerOf2: state.fallbackNormal.isPowerOf2
            };
        }

        if (state.normalTextureCache.has(path)) {
            return state.normalTextureCache.get(path);
        }

        const record = {
            status: "loading",
            texture: state.fallbackNormal.texture,
            view: state.fallbackNormal.view,
            mipLevelCount: 1,
            isPowerOf2: state.fallbackNormal.isPowerOf2,
            promise: null
        };
        state.normalTextureCache.set(path, record);

        record.promise = loadImage(path)
            .then(function (image) {
                const useMipmaps = isPowerOf2(image.width) && isPowerOf2(image.height);
                const mipSources = useMipmaps ? createMipCanvases(image) : [image];
                const width = mipSources[0].width;
                const height = mipSources[0].height;
                const texture = device.createTexture({
                    label: "A3-Student-NormalTexture-" + path,
                    size: [width, height, 1],
                    mipLevelCount: mipSources.length,
                    format: "rgba8unorm",
                    usage: GPUTextureUsage.TEXTURE_BINDING |
                        GPUTextureUsage.COPY_DST |
                        GPUTextureUsage.RENDER_ATTACHMENT
                });

                mipSources.forEach(function (sourceLevel, level) {
                    const levelWidth = sourceLevel.width;
                    const levelHeight = sourceLevel.height;
                    device.queue.copyExternalImageToTexture(
                        { source: sourceLevel, flipY: true },
                        { texture: texture, mipLevel: level },
                        [levelWidth, levelHeight, 1]
                    );
                });

                record.texture = texture;
                record.view = texture.createView();
                record.mipLevelCount = mipSources.length;
                record.isPowerOf2 = useMipmaps;
                record.status = "ready";
                renderOnce();
                return record;
            })
            .catch(function (error) {
                console.warn("[" + A3_STUDENT_LABEL + "] normal texture warning:", error);
                record.status = "failed";
                return record;
            });

        return record;
    }

    function getOrCreateSampler(minFilterValue, magFilterValue, wrapMode) {
        const descriptor = getSamplerDescriptor(minFilterValue, magFilterValue, wrapMode);
        const key = [
            descriptor.minFilter,
            descriptor.magFilter,
            descriptor.mipmapFilter,
            descriptor.addressModeU
        ].join("|");

        if (state.samplerCache.has(key)) {
            return {
                key: key,
                sampler: state.samplerCache.get(key)
            };
        }

        const sampler = device.createSampler(Object.assign({
            label: "A3-Student-Sampler-" + key
        }, descriptor));
        state.samplerCache.set(key, sampler);
        return {
            key: key,
            sampler: sampler
        };
    }

    function getTextureSettings(scene) {
        return {
            diffuseMapChecked: !!scene.diffuseMapEnabled,
            normalMapChecked: !!scene.normalMapEnabled,
            diffMinFilter: String(scene.diffMinFilter || 9728),
            diffMagFilter: String(scene.diffMagFilter || 9728),
            normMinFilter: String(scene.normMinFilter || 9728),
            normMagFilter: String(scene.normMagFilter || 9728)
        };
    }

    function createMaterialBindGroup(objectId, bindGroupIndex, material, textureSettings) {
        const diffuseMapChecked = textureSettings.diffuseMapChecked;
        const normalMapChecked = textureSettings.normalMapChecked;
        const diffMinFilter = textureSettings.diffMinFilter;
        const diffMagFilter = textureSettings.diffMagFilter;
        const normMinFilter = textureSettings.normMinFilter;
        const normMagFilter = textureSettings.normMagFilter;

        const materialSnapshot = createMaterialSnapshot(material);

        let diffuseEnabled = 0.0;
        let diffuseTextureRecord = {
            status: "missing",
            view: state.fallbackDiffuse.view,
            mipLevelCount: 1,
            isPowerOf2: state.fallbackDiffuse.isPowerOf2
        };
        let diffuseBindingKey = "fallback";
        let diffuseWrapMode = "clamp-to-edge";

        if (diffuseMapChecked && materialSnapshot.diffPath) {
            diffuseTextureRecord = ensureDiffuseTexture(materialSnapshot.diffPath);
            diffuseBindingKey = materialSnapshot.diffPath + "|" + diffuseTextureRecord.status;
            diffuseEnabled = (diffuseTextureRecord.status === "ready" || diffuseTextureRecord.status === "loading") ? 1.0 : 0.0;
            diffuseWrapMode = diffuseTextureRecord.isPowerOf2 ? "repeat" : "clamp-to-edge";
        } else if (diffuseMapChecked) {
            diffuseBindingKey = "fallback-missing";
        }

        let normalEnabled = 0.0;
        let normalTextureRecord = {
            status: "missing",
            view: state.fallbackNormal.view,
            mipLevelCount: 1,
            isPowerOf2: state.fallbackNormal.isPowerOf2
        };
        let normalBindingKey = "fallback";
        let normalWrapMode = "clamp-to-edge";

        if (normalMapChecked && materialSnapshot.normPath) {
            normalTextureRecord = ensureNormalTexture(materialSnapshot.normPath);
            normalBindingKey = materialSnapshot.normPath + "|" + normalTextureRecord.status;
            normalEnabled = (normalTextureRecord.status === "ready" || normalTextureRecord.status === "loading") ? 1.0 : 0.0;
            normalWrapMode = normalTextureRecord.isPowerOf2 ? "repeat" : "clamp-to-edge";
        } else if (normalMapChecked) {
            normalBindingKey = "fallback-missing";
        }

        const diffuseSamplerInfo = getOrCreateSampler(diffMinFilter, diffMagFilter, diffuseWrapMode);
        const normalSamplerInfo = getOrCreateSampler(normMinFilter, normMagFilter, normalWrapMode);

        const bindGroupKey = [
            objectId,
            String(bindGroupIndex),
            diffuseSamplerInfo.key,
            diffuseBindingKey,
            diffuseWrapMode,
            normalSamplerInfo.key,
            normalBindingKey,
            normalWrapMode
        ].join("|");

        if (state.materialBindGroupCache.has(bindGroupKey)) {
            return {
                bindGroup: state.materialBindGroupCache.get(bindGroupKey),
                diffuseEnabled: diffuseEnabled,
                normalEnabled: normalEnabled,
                materialSnapshot: materialSnapshot
            };
        }

        const bindGroup = device.createBindGroup({
            label: "A3-Student-BindGroup-" + objectId + "-" + bindGroupIndex,
            layout: state.bindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: state.uniformBuffers[bindGroupIndex] }
                },
                {
                    binding: 1,
                    resource: diffuseSamplerInfo.sampler
                },
                {
                    binding: 2,
                    resource: diffuseTextureRecord.view
                },
                {
                    binding: 3,
                    resource: normalSamplerInfo.sampler
                },
                {
                    binding: 4,
                    resource: normalTextureRecord.view
                }
            ]
        });
        state.materialBindGroupCache.set(bindGroupKey, bindGroup);

        return {
            bindGroup: bindGroup,
            diffuseEnabled: diffuseEnabled,
            normalEnabled: normalEnabled,
            materialSnapshot: materialSnapshot
        };
    }

    function renderOnce() {
        ensureRenderTargets(state);

        const encoder = state.device.createCommandEncoder({ label: "A3-Student-Encoder" });
        const swapChainView = state.context.getCurrentTexture().createView();
        const msaaColorView = state.msaaColorTexture.createView();
        const depthView = state.depthTexture.createView();
        const clearColor = Array.isArray(state.scene.clearColor) && state.scene.clearColor.length >= 4
            ? state.scene.clearColor
            : [0.9, 0.9, 0.9, 1.0];
        const clearValue = {
            r: Number(clearColor[0]),
            g: Number(clearColor[1]),
            b: Number(clearColor[2]),
            a: Number(clearColor[3])
        };

        function createPassDescriptor(clearAttachments) {
            return {
                colorAttachments: [{
                    view: msaaColorView,
                    resolveTarget: swapChainView,
                    clearValue: clearValue,
                    loadOp: clearAttachments ? "clear" : "load",
                    storeOp: "store"
                }],
                depthStencilAttachment: {
                    view: depthView,
                    depthClearValue: 1.0,
                    depthLoadOp: clearAttachments ? "clear" : "load",
                    depthStoreOp: "store"
                }
            };
        }

        function beginScenePass(clearAttachments) {
            return encoder.beginRenderPass(createPassDescriptor(clearAttachments));
        }

        function encodeObjectPass(objectId, gpuMesh, modelMatrix, clearAttachments, bindGroupIndex, material, modeX, textureSettings) {
            const pipeline = getOrCreateMeshPipeline(state.scene.depthEnabled, state.scene.cullFace, state.scene.frontFace);
            if (!pipeline) {
                return false;
            }

            const materialBinding = createMaterialBindGroup(
                objectId,
                bindGroupIndex,
                material,
                textureSettings
            );
            updateGlobalsForModel(
                modelMatrix,
                state.uniformBuffers[bindGroupIndex],
                materialBinding.materialSnapshot,
                modeX || 0,
                materialBinding.diffuseEnabled,
                materialBinding.normalEnabled,
                null
            );

            const pass = beginScenePass(clearAttachments);

            pass.setPipeline(pipeline);
            pass.setBindGroup(0, materialBinding.bindGroup);
            pass.setVertexBuffer(0, gpuMesh.vertexBuffer);
            pass.setIndexBuffer(gpuMesh.indexBuffer, gpuMesh.indexFormat);
            pass.drawIndexed(gpuMesh.indexCount, 1, 0, 0, 0);
            pass.end();
            return true;
        }

        function encodeLinePass(objectId, gpuMesh, modelMatrix, clearAttachments, bindGroupIndex, material, lineKind, textureSettings) {
            let pipeline = null;
            let vertexBuffer = null;
            let indexBuffer = null;
            let indexCount = 0;
            let indexFormat = "uint16";

            if (lineKind === "frame") {
                if (!gpuMesh.frameVertexBuffer || !gpuMesh.frameIndexBuffer || gpuMesh.frameIndexCount <= 0) {
                    return false;
                }
                pipeline = getOrCreateFramePipeline(state.scene.depthEnabled);
                vertexBuffer = gpuMesh.frameVertexBuffer;
                indexBuffer = gpuMesh.frameIndexBuffer;
                indexCount = gpuMesh.frameIndexCount;
                indexFormat = gpuMesh.frameIndexFormat;
            } else {
                if (!gpuMesh.vertexBuffer || !gpuMesh.edgeIndexBuffer || gpuMesh.edgeIndexCount <= 0) {
                    return false;
                }
                pipeline = getOrCreateWirePipeline(state.scene.depthEnabled);
                vertexBuffer = gpuMesh.vertexBuffer;
                indexBuffer = gpuMesh.edgeIndexBuffer;
                indexCount = gpuMesh.edgeIndexCount;
                indexFormat = gpuMesh.edgeIndexFormat;
            }

            const materialBinding = createMaterialBindGroup(
                objectId,
                bindGroupIndex,
                material,
                textureSettings
            );
            updateGlobalsForModel(
                modelMatrix,
                state.uniformBuffers[bindGroupIndex],
                materialBinding.materialSnapshot,
                0,
                0.0,
                0.0,
                -2.0
            );

            const pass = beginScenePass(clearAttachments);

            pass.setPipeline(pipeline);
            pass.setBindGroup(0, materialBinding.bindGroup);
            pass.setVertexBuffer(0, vertexBuffer);
            pass.setIndexBuffer(indexBuffer, indexFormat);
            pass.drawIndexed(indexCount, 1, 0, 0, 0);
            pass.end();
            return true;
        }

        const t = state.scene.timings || { day: 0, month: 0, year: 0, sunday: 0 };
        const sunMatrix = state.scene.sunMatrix || [rotateY(t.sunday || 0), scalem(0.65, 0.65, 0.65)].reduce(mult);
        const earthBase = state.scene.earthMatrix || [rotateY(t.year || 0), translate(1.8, 0.0, 0.0), rotateY(-(t.year || 0)), rotateZ(-23.44), rotateY(t.day || 0)].reduce(mult);
        const moonBase = state.scene.moonMatrix || [rotateY(t.year || 0), translate(1.8, 0.0, 0.0), rotateZ(5.14), rotateY(t.month || 0), translate(0.6, 0, 0)].reduce(mult);
        const lightModel = state.scene.lightModelMatrix || [rotateX(66), rotateZ(-16), translate(0, 3.5, 0)].reduce(mult);

        const obj1Model = sunMatrix;
        const obj2Model = [earthBase, scalem(0.25, 0.25, 0.25)].reduce(mult);
        const obj3Model = [moonBase, scalem(0.1, 0.1, 0.1)].reduce(mult);

        const res = Number(state.scene.res || 2);
        const textureSettings = getTextureSettings(state.scene);
        let drewAny = false;

        const drawSequence = [
            {
                enabled: !!state.scene.drawBulb,
                objectId: "bulb",
                warnKey: "bulb",
                meshName: "sphere",
                modelMatrix: lightModel,
                bindGroupIndex: 0,
                material: null,
                modeX: -1
            },
            {
                enabled: !!state.scene.drawObj1,
                objectId: "obj1",
                warnKey: "obj1",
                meshName: state.scene.obj1Mesh || "sphere",
                modelMatrix: obj1Model,
                bindGroupIndex: 1,
                material: state.scene.obj1Material,
                modeX: 0,
                drawFrame: !!state.scene.drawFrame,
                drawWire: !!state.scene.drawWire
            },
            {
                enabled: !!state.scene.drawObj2,
                objectId: "obj2",
                warnKey: "obj2",
                meshName: state.scene.obj2Mesh || "sphere",
                modelMatrix: obj2Model,
                bindGroupIndex: 2,
                material: state.scene.obj2Material,
                modeX: 0
            },
            {
                enabled: !!state.scene.drawObj3,
                objectId: "obj3",
                warnKey: "obj3",
                meshName: state.scene.obj3Mesh || "sphere",
                modelMatrix: obj3Model,
                bindGroupIndex: 3,
                material: state.scene.obj3Material,
                modeX: 0
            }
        ];

        for (const drawItem of drawSequence) {
            if (!drawItem.enabled) {
                continue;
            }
            try {
                const gpuMesh = getOrCreateGpuMesh(drawItem.meshName, res);
                drewAny = encodeObjectPass(
                    drawItem.objectId,
                    gpuMesh,
                    drawItem.modelMatrix,
                    !drewAny,
                    drawItem.bindGroupIndex,
                    drawItem.material,
                    drawItem.modeX,
                    textureSettings
                ) || drewAny;

                if (drawItem.objectId === "obj1") {
                    if (drawItem.drawFrame) {
                        drewAny = encodeLinePass("obj1", gpuMesh, drawItem.modelMatrix, !drewAny, 4, drawItem.material, "frame", textureSettings) || drewAny;
                    }
                    if (drawItem.drawWire) {
                        drewAny = encodeLinePass("obj1", gpuMesh, drawItem.modelMatrix, !drewAny, 5, drawItem.material, "wire", textureSettings) || drewAny;
                    }
                }
            } catch (error) {
                console.warn("[" + A3_STUDENT_LABEL + "] " + drawItem.warnKey + " draw warning:", error);
            }
        }

        if (!drewAny) {
            const pass = beginScenePass(true);
            pass.end();
        }

        state.device.queue.submit([encoder.finish()]);
    }

    const initialMeshElem = document.getElementById("obj1MeshSelect");
    const initialResElem = document.getElementById("resSlider");
    const initialDiffuseMapElem = document.getElementById("diffuseMap");
    const initialNormalMapElem = document.getElementById("normalMap");
    const initialDiffMinElem = document.getElementById("diffMinFilter");
    const initialDiffMagElem = document.getElementById("diffMagFilter");
    const initialNormMinElem = document.getElementById("normMinFilter");
    const initialNormMagElem = document.getElementById("normMagFilter");
    const initialMesh = initialMeshElem.value;
    const initialRes = Number(initialResElem.value);

    state.scene.obj1Mesh = initialMesh;
    state.scene.obj2Mesh = document.getElementById("obj2MeshSelect").value;
    state.scene.obj3Mesh = document.getElementById("obj3MeshSelect").value;
    state.scene.res = initialRes;
    state.scene.diffuseMapEnabled = initialDiffuseMapElem.checked;
    state.scene.normalMapEnabled = initialNormalMapElem.checked;
    state.scene.diffMinFilter = initialDiffMinElem.value;
    state.scene.diffMagFilter = initialDiffMagElem.value;
    state.scene.normMinFilter = initialNormMinElem.value;
    state.scene.normMagFilter = initialNormMagElem.value;
    primeGeometry(initialMesh, initialRes);
    renderOnce();

    return {
        ready: true,
        setSceneState,
        renderOnce
    };
}

async function bootstrapTask3WebGPUPreview() {
    const canvas = document.getElementById("canvas");
    const statusElem = document.getElementById("webgpuStatus");

    try {
        task3WebGPUPreviewHandle = await runTask3WebGPUPreview(canvas, statusElem);
    } catch (error) {
        console.warn("[" + A3_STUDENT_LABEL + "] non-fatal runtime error:", error);
        wgpuSetStatus(statusElem, A3_STUDENT_LABEL + " failed: " + String(error), "error");
    }
}

function syncTask3WebGPUPreview(scenePatch) {
    const handle = task3WebGPUPreviewHandle;
    if (!handle || !handle.ready) return;

    handle.setSceneState(scenePatch);
    handle.renderOnce();
}

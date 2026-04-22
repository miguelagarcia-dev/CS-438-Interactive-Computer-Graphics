"use strict";

// ----------------------------------------------------------------------------
// CS 438 / CS 657 - Assignment 2 WebGPU runtime.
// Handles GPU resources, per-frame uniforms, and draw passes (fill/wire/frame).

var task2WgslSourcePromise = null;
function loadTask2WgslSource() {
    if (!task2WgslSourcePromise) {
        task2WgslSourcePromise = fetch("./resources/webgpu-task2.wgsl", { cache: "no-store" })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error("Unable to load ./resources/webgpu-task2.wgsl (" + response.status + ")");
                }
                return response.text();
            })
            .catch(function (error) {
                task2WgslSourcePromise = null;
                throw error;
            });
    }
    return task2WgslSourcePromise;
}

async function runTask2WebGPUPreview(canvas, statusElem) {
    var statusPrefix = "A2 WebGPU Canvas";
    var disposed = false;

    // Fail-soft default handle: keeps task2.js safe even when WebGPU is unavailable.
    var result = {
        ready: false,
        setGeometry: function () { },
        setFrameGeometry: function () { },
        updateScene: function () { },
        renderOnce: function () { },
        destroy: function () { }
    };

    try {
        var init = await wgpuInitCanvasContext(canvas, statusElem, statusPrefix);
        if (!init) {
            return result;
        }

        var device = init.device;
        var context = init.context;
        var format = init.format;
        var sampleCount = 4;

        // Shader compile + validation info (if available in this browser build).
        var shaderSource = await loadTask2WgslSource();
        var shaderModule = device.createShaderModule({
            label: "A2-Task2-ShaderModule",
            code: shaderSource
        });
        if (typeof shaderModule.getCompilationInfo === "function") {
            var info = await shaderModule.getCompilationInfo();
            var compileErrors = info.messages.filter(function (msg) {
                return msg.type === "error";
            });
            if (compileErrors.length > 0) {
                throw new Error(compileErrors[0].message || "Unknown WGSL compile error.");
            }
            var compileWarnings = info.messages.filter(function (msg) {
                return msg.type === "warning";
            });
            if (compileWarnings.length > 0) {
                console.warn("[WebGPU A2] WGSL warnings:", compileWarnings.map(function (msg) { return msg.message; }));
            }
        }

        var bindGroupLayout = device.createBindGroupLayout({
            label: "A2-Task2-BindGroupLayout",
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: "uniform" }
            }]
        });
        var pipelineLayout = device.createPipelineLayout({
            label: "A2-Task2-PipelineLayout",
            bindGroupLayouts: [bindGroupLayout]
        });
        var objectUniformBuffers = [];
        var objectBindGroups = [];

        function ensureObjectUniformSlot(slotIndex) {
            if (objectUniformBuffers[slotIndex] && objectBindGroups[slotIndex]) {
                return;
            }
            var uniformBuffer = device.createBuffer({
                label: "A2-Task2-GlobalsBuffer-" + slotIndex,
                size: 80 * Float32Array.BYTES_PER_ELEMENT, // proj + modelview + mode/color + light + material + normalmat
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            });
            var bindGroup = device.createBindGroup({
                label: "A2-Task2-BindGroup-" + slotIndex,
                layout: bindGroupLayout,
                entries: [{
                    binding: 0,
                    resource: { buffer: uniformBuffer }
                }]
            });
            objectUniformBuffers[slotIndex] = uniformBuffer;
            objectBindGroups[slotIndex] = bindGroup;
        }

        var pipeline = device.createRenderPipeline({
            label: "A2-Task2-MeshPipeline",
            layout: pipelineLayout,
            vertex: {
                module: shaderModule,
                entryPoint: "vs_main",
                buffers: [{
                    arrayStride: 11 * Float32Array.BYTES_PER_ELEMENT,
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: "float32x3" },
                        { shaderLocation: 1, offset: 3 * Float32Array.BYTES_PER_ELEMENT, format: "float32x3" },
                        { shaderLocation: 2, offset: 6 * Float32Array.BYTES_PER_ELEMENT, format: "float32x3" },
                        { shaderLocation: 3, offset: 9 * Float32Array.BYTES_PER_ELEMENT, format: "float32x2" }
                    ]
                }]
            },
            fragment: {
                module: shaderModule,
                entryPoint: "fs_main",
                targets: [{ format: format }]
            },
            primitive: {
                topology: "triangle-list",
                cullMode: "none",
                frontFace: "ccw"
            },
            multisample: {
                count: sampleCount
            },
            depthStencil: {
                format: "depth24plus",
                depthWriteEnabled: true,
                depthCompare: "less"
            }
        });
        var framePipeline = device.createRenderPipeline({
            label: "A2-Task2-FramePipeline",
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
                targets: [{ format: format }]
            },
            primitive: {
                topology: "line-list",
                cullMode: "none",
                frontFace: "ccw"
            },
            multisample: {
                count: sampleCount
            },
            depthStencil: {
                format: "depth24plus",
                depthWriteEnabled: true,
                depthCompare: "less"
            }
        });
        var wirePipeline = device.createRenderPipeline({
            label: "A2-Task2-WirePipeline",
            layout: pipelineLayout,
            vertex: {
                module: shaderModule,
                entryPoint: "vs_main",
                buffers: [{
                    arrayStride: 11 * Float32Array.BYTES_PER_ELEMENT,
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: "float32x3" },
                        { shaderLocation: 1, offset: 3 * Float32Array.BYTES_PER_ELEMENT, format: "float32x3" },
                        { shaderLocation: 2, offset: 6 * Float32Array.BYTES_PER_ELEMENT, format: "float32x3" },
                        { shaderLocation: 3, offset: 9 * Float32Array.BYTES_PER_ELEMENT, format: "float32x2" }
                    ]
                }]
            },
            fragment: {
                module: shaderModule,
                entryPoint: "fs_main",
                targets: [{ format: format }]
            },
            primitive: {
                topology: "line-list",
                cullMode: "none",
                frontFace: "ccw"
            },
            multisample: {
                count: sampleCount
            },
            depthStencil: {
                format: "depth24plus",
                depthWriteEnabled: false,
                depthCompare: "less-equal"
            }
        });

        var msaaColorTexture = null;
        var depthTexture = null;
        var targetWidth = 0;
        var targetHeight = 0;

        function ensureRenderTargets() {
            var w = Math.max(1, canvas.width | 0);
            var h = Math.max(1, canvas.height | 0);
            if (msaaColorTexture && depthTexture && targetWidth === w && targetHeight === h) {
                return;
            }
            if (msaaColorTexture) {
                msaaColorTexture.destroy();
            }
            if (depthTexture) {
                depthTexture.destroy();
            }
            targetWidth = w;
            targetHeight = h;
            msaaColorTexture = device.createTexture({
                label: "A2-Task2-MsaaColorTexture",
                size: [w, h, 1],
                sampleCount: sampleCount,
                format: format,
                usage: GPUTextureUsage.RENDER_ATTACHMENT
            });
            depthTexture = device.createTexture({
                label: "A2-Task2-DepthTexture",
                size: [w, h, 1],
                sampleCount: sampleCount,
                format: "depth24plus",
                usage: GPUTextureUsage.RENDER_ATTACHMENT
            });
        }

        var meshVertexBuffer = null;
        var meshIndexBuffer = null;
        var meshIndexCount = 0;
        var meshIndexFormat = "uint16";
        var wireIndexBuffer = null;
        var wireIndexCount = 0;
        var wireIndexFormat = "uint16";
        var drawEnabled = true;
        var wireframeEnabled = false;
        var sceneObjects = [];
        var frameVertexBuffer = null;
        var frameVertexCount = 0;
        var frameEnabled = false;
        var lightPosVSState = [0.0, 0.0, 1.0];
        var lightColorState = [1.0, 1.0, 1.0];
        var shadingModeState = 0.0;

        function sanitize3(values, fallback) {
            if (!values || values.length < 3) {
                return fallback.slice(0, 3);
            }
            var out = fallback.slice(0, 3);
            for (var i = 0; i < 3; i++) {
                var v = Number(values[i]);
                out[i] = isFinite(v) ? v : fallback[i];
            }
            return out;
        }

        // Keep latest valid geometry if a new upload fails.
        function setGeometry(geometry) {
            if (disposed || !geometry || !geometry.vertices) {
                return;
            }

            try {
                var vertices = new Float32Array(geometry.vertices);
                var vertexStrideFloats = 11;
                if (geometry.stride && Number.isFinite(Number(geometry.stride))) {
                    var strideCandidate = Math.floor(Number(geometry.stride) / Float32Array.BYTES_PER_ELEMENT);
                    if (strideCandidate >= 3) {
                        vertexStrideFloats = strideCandidate;
                    }
                }
                var indexArray = geometry.indices;
                if (!indexArray || indexArray.length === 0) {
                    var generated = [];
                    var vCount = Math.floor(vertices.length / vertexStrideFloats);
                    for (var i = 0; i < vCount; i++) {
                        generated.push(i);
                    }
                    indexArray = generated;
                }

                var maxIndex = 0;
                for (var k = 0; k < indexArray.length; k++) {
                    if (indexArray[k] > maxIndex) {
                        maxIndex = indexArray[k];
                    }
                }

                var indexFormat = maxIndex > 65535 ? "uint32" : "uint16";
                var indices = indexFormat === "uint32"
                    ? new Uint32Array(indexArray)
                    : new Uint16Array(indexArray);
                function buildWireIndicesFromTriangles(triangleIndices, packedVertices, strideFloats) {
                    // Build a line-list from triangle indices.
                    // Important: deduplicate by geometric position (not raw index) so split-vertex
                    // meshes do not draw the same visible edge twice.
                    var quantScale = 1000000;
                    var edgeMap = new Map(); // unique geometric edges
                    var positionRepMap = new Map(); // canonical vertex index per quantized position
                    var positionKeyCache = new Map(); // cached quantized position keys
                    var wire = [];

                    function positionKeyForIndex(vertexIndex) {
                        if (positionKeyCache.has(vertexIndex)) {
                            return positionKeyCache.get(vertexIndex);
                        }
                        var base = vertexIndex * strideFloats;
                        if (base + 2 >= packedVertices.length) {
                            var fallback = "idx:" + vertexIndex;
                            positionKeyCache.set(vertexIndex, fallback);
                            return fallback;
                        }
                        var key =
                            Math.round(packedVertices[base + 0] * quantScale) + "," +
                            Math.round(packedVertices[base + 1] * quantScale) + "," +
                            Math.round(packedVertices[base + 2] * quantScale);
                        positionKeyCache.set(vertexIndex, key);
                        return key;
                    }

                    function canonicalIndex(vertexIndex) {
                        var posKey = positionKeyForIndex(vertexIndex);
                        if (positionRepMap.has(posKey)) {
                            return positionRepMap.get(posKey);
                        }
                        positionRepMap.set(posKey, vertexIndex);
                        return vertexIndex;
                    }

                    function addEdge(i0, i1) {
                        var c0 = canonicalIndex(i0);
                        var c1 = canonicalIndex(i1);
                        var k0 = positionKeyForIndex(c0);
                        var k1 = positionKeyForIndex(c1);
                        if (k0 === k1) {
                            return;
                        }
                        var swap = k0 > k1;
                        var key = swap ? (k1 + "|" + k0) : (k0 + "|" + k1);
                        if (edgeMap.has(key)) {
                            return;
                        }
                        edgeMap.set(key, true);
                        wire.push(swap ? c1 : c0, swap ? c0 : c1);
                    }
                    for (var ti = 0; ti + 2 < triangleIndices.length; ti += 3) {
                        var ia = triangleIndices[ti + 0];
                        var ib = triangleIndices[ti + 1];
                        var ic = triangleIndices[ti + 2];
                        addEdge(ia, ib);
                        addEdge(ib, ic);
                        addEdge(ic, ia);
                    }
                    return wire;
                }
                var wireIndexArray = buildWireIndicesFromTriangles(indices, vertices, vertexStrideFloats);
                var lineIndices = indexFormat === "uint32"
                    ? new Uint32Array(wireIndexArray)
                    : new Uint16Array(wireIndexArray);
                var lineCount = lineIndices.length;
                var uploadIndices = indices;
                // queue.writeBuffer requires byte size multiple of 4.
                // uint16 index arrays can be odd-length (2 * odd bytes), so pad one element for upload.
                if (indexFormat === "uint16" && (indices.length % 2 !== 0)) {
                    uploadIndices = new Uint16Array(indices.length + 1);
                    uploadIndices.set(indices);
                }
                var uploadLineIndices = lineIndices;
                if (indexFormat === "uint16" && (lineIndices.length % 2 !== 0)) {
                    uploadLineIndices = new Uint16Array(lineIndices.length + 1);
                    uploadLineIndices.set(lineIndices);
                }

                var nextVertexBuffer = device.createBuffer({
                    label: "A2-Task2-MeshVertexBuffer",
                    size: vertices.byteLength,
                    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
                });
                device.queue.writeBuffer(nextVertexBuffer, 0, vertices);

                var nextIndexBuffer = device.createBuffer({
                    label: "A2-Task2-MeshIndexBuffer",
                    size: uploadIndices.byteLength,
                    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
                });
                device.queue.writeBuffer(nextIndexBuffer, 0, uploadIndices);
                var nextWireIndexBuffer = null;
                if (lineCount > 0) {
                    nextWireIndexBuffer = device.createBuffer({
                        label: "A2-Task2-WireIndexBuffer",
                        size: uploadLineIndices.byteLength,
                        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
                    });
                    device.queue.writeBuffer(nextWireIndexBuffer, 0, uploadLineIndices);
                }

                if (meshVertexBuffer) {
                    meshVertexBuffer.destroy();
                }
                if (meshIndexBuffer) {
                    meshIndexBuffer.destroy();
                }
                if (wireIndexBuffer) {
                    wireIndexBuffer.destroy();
                }

                meshVertexBuffer = nextVertexBuffer;
                meshIndexBuffer = nextIndexBuffer;
                meshIndexCount = indices.length;
                meshIndexFormat = indexFormat;
                wireIndexBuffer = nextWireIndexBuffer;
                wireIndexCount = lineCount;
                wireIndexFormat = indexFormat;
            } catch (error) {
                wgpuSetStatus(statusElem, statusPrefix + " geometry warning: " + error.message, "warn");
                console.warn("[WebGPU A2] geometry upload failed; keeping previous mesh.", error);
            }
        }

        function setFrameGeometry(frameGeometry) {
            if (disposed || !frameGeometry || !frameGeometry.vertices) {
                return;
            }
            try {
                var frameVertices = new Float32Array(frameGeometry.vertices);
                var nextFrameVertexBuffer = device.createBuffer({
                    label: "A2-Task2-FrameVertexBuffer",
                    size: frameVertices.byteLength,
                    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
                });
                device.queue.writeBuffer(nextFrameVertexBuffer, 0, frameVertices);
                if (frameVertexBuffer) {
                    frameVertexBuffer.destroy();
                }
                frameVertexBuffer = nextFrameVertexBuffer;
                frameVertexCount = Math.floor(frameVertices.length / 6);
            } catch (error) {
                wgpuSetStatus(statusElem, statusPrefix + " frame warning: " + error.message, "warn");
                console.warn("[WebGPU A2] frame upload failed; keeping previous frame buffer.", error);
            }
        }

        var viewMatrixState = mat4();
        var projMatrixState = mat4();
        var modelMatrixState = mat4();
        function sanitizeShadingMode(mode) {
            var numericMode = Number(mode);
            if (isNaN(numericMode)) {
                return 0.0;
            }
            if (numericMode !== 0 && numericMode !== 1 && numericMode !== 2) {
                return 0.0;
            }
            return numericMode;
        }

        // Compact per-frame scene update to avoid setter sprawl in task2.js.
        function updateScene(sceneState) {
            if (disposed || !sceneState) {
                return;
            }

            // Scene update is intentionally stateless-from-caller perspective:
            // task2.js sends a full frame description, runtime caches latest values.
            if (sceneState.viewMatrix) {
                viewMatrixState = sceneState.viewMatrix;
            }
            if (sceneState.projMatrix) {
                projMatrixState = sceneState.projMatrix;
            }
            if (sceneState.modelMatrix) {
                modelMatrixState = sceneState.modelMatrix;
            }

            if (sceneState.sceneObjects && Array.isArray(sceneState.sceneObjects)) {
                sceneObjects = sceneState.sceneObjects.slice(0, 16);
            }

            if (sceneState.drawEnabled !== undefined) {
                drawEnabled = !!sceneState.drawEnabled;
            } else if (sceneState.sceneObjects && Array.isArray(sceneState.sceneObjects)) {
                drawEnabled = sceneObjects.length > 0;
            }

            if (sceneState.frameEnabled !== undefined) {
                frameEnabled = !!sceneState.frameEnabled;
            }
            if (sceneState.wireframeEnabled !== undefined) {
                wireframeEnabled = !!sceneState.wireframeEnabled;
            }

            if (sceneState.lightPosVS && sceneState.lightPosVS.length >= 3) {
                lightPosVSState = sanitize3(sceneState.lightPosVS, [0.0, 0.0, 1.0]);
            }
            if (sceneState.lightColor && sceneState.lightColor.length >= 3) {
                lightColorState = sanitize3(sceneState.lightColor, [1.0, 1.0, 1.0]);
            }

            if (sceneState.shadingMode !== undefined) {
                shadingModeState = sanitizeShadingMode(sceneState.shadingMode);
            }
        }

        function writeGlobals(uniformBuffer, sceneObject, modelMatrix) {
            var modelView = mult(viewMatrixState, modelMatrix || modelMatrixState);
            var g = new Float32Array(80);

            // Uniform layout mirrors Globals struct in webgpu-task2.wgsl.
            var projPacked = flatten(projMatrixState);
            var modelViewPacked = flatten(modelView);
            for (var i = 0; i < 16; i++) {
                g[i] = projPacked[i];
                g[16 + i] = modelViewPacked[i];
            }
            var isBulb = sceneObject && sceneObject.isBulb ? 1.0 : 0.0;
            var shadingMode = sceneObject && sceneObject.shadingMode !== undefined
                ? Number(sceneObject.shadingMode)
                : (isBulb > 0.5 ? -1.0 : shadingModeState);
            g[32] = isBulb;
            g[33] = isNaN(shadingMode) ? 0.0 : shadingMode;
            g[34] = 0.0;
            g[35] = 0.0;
            var color = (sceneObject && sceneObject.color && sceneObject.color.length >= 3)
                ? sceneObject.color
                : [1.0, 1.0, 1.0];
            var colorSafe = sanitize3(color, [1.0, 1.0, 1.0]);
            g[36] = colorSafe[0];
            g[37] = colorSafe[1];
            g[38] = colorSafe[2];
            g[39] = 1.0;
            g[40] = lightPosVSState[0];
            g[41] = lightPosVSState[1];
            g[42] = lightPosVSState[2];
            g[43] = 1.0;
            g[44] = lightColorState[0];
            g[45] = lightColorState[1];
            g[46] = lightColorState[2];
            g[47] = 1.0;
            var material = sceneObject && sceneObject.material ? sceneObject.material : null;
            var ka = material && material.colors && material.colors.ka ? sanitize3(material.colors.ka, [0.1, 0.1, 0.1]) : [0.1, 0.1, 0.1];
            var kd = material && material.colors && material.colors.kd ? sanitize3(material.colors.kd, [0.7, 0.7, 0.7]) : [0.7, 0.7, 0.7];
            var ks = material && material.colors && material.colors.ks ? sanitize3(material.colors.ks, [0.2, 0.2, 0.2]) : [0.2, 0.2, 0.2];
            var qs = material && typeof material.qs === "number" ? material.qs : 40.0;
            if (!isFinite(qs) || qs < 0.0) {
                qs = 40.0;
            }
            g[48] = ka[0]; g[49] = ka[1]; g[50] = ka[2]; g[51] = 1.0;
            g[52] = kd[0]; g[53] = kd[1]; g[54] = kd[2]; g[55] = 1.0;
            g[56] = ks[0]; g[57] = ks[1]; g[58] = ks[2]; g[59] = 1.0;
            g[60] = qs; g[61] = 0.0; g[62] = 0.0; g[63] = 0.0;
            var normalMatPacked = flatten(transpose(inverse(modelView)));
            for (var j = 0; j < 16; j++) {
                g[64 + j] = normalMatPacked[j];
            }
            device.queue.writeBuffer(uniformBuffer, 0, g);
        }

        function renderOnce() {
            if (disposed) {
                return;
            }

            // Render order: clear -> fill meshes -> wire overlay -> coordinate frame.
            ensureRenderTargets();

            var currentTexture = context.getCurrentTexture();
            var encoder = device.createCommandEncoder({ label: "A2-Task2-Encoder" });
            var pass = encoder.beginRenderPass({
                colorAttachments: [{
                    view: msaaColorTexture.createView(),
                    resolveTarget: currentTexture.createView(),
                    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                    loadOp: "clear",
                    storeOp: "store"
                }],
                depthStencilAttachment: {
                    view: depthTexture.createView(),
                    depthClearValue: 1.0,
                    depthLoadOp: "clear",
                    depthStoreOp: "store"
                }
            });

            // Keep this list available even when mesh draw is skipped, so frame-only mode is safe.
            var drawList = [];
            var canDraw = drawEnabled && meshVertexBuffer && meshIndexBuffer && meshIndexCount > 0;
            if (canDraw) {
                if (sceneObjects.length > 0) {
                    for (var i = 0; i < sceneObjects.length; i++) {
                        var obj = sceneObjects[i];
                        if (!obj || obj.visible === false) {
                            continue;
                        }
                        drawList.push({
                            modelMatrix: obj.modelMatrix || mat4(),
                            isBulb: !!obj.isBulb,
                            color: obj.color,
                            shadingMode: obj.shadingMode,
                            material: obj.material
                        });
                    }
                } else {
                    drawList.push({
                        modelMatrix: modelMatrixState,
                        isBulb: false,
                        color: [1.0, 1.0, 1.0],
                        shadingMode: shadingModeState,
                        material: null
                    });
                }

                pass.setPipeline(pipeline);
                pass.setVertexBuffer(0, meshVertexBuffer);
                pass.setIndexBuffer(meshIndexBuffer, meshIndexFormat);

                for (var drawIndex = 0; drawIndex < drawList.length; drawIndex++) {
                    ensureObjectUniformSlot(drawIndex);
                    writeGlobals(objectUniformBuffers[drawIndex], drawList[drawIndex], drawList[drawIndex].modelMatrix);
                    pass.setBindGroup(0, objectBindGroups[drawIndex]);
                    pass.drawIndexed(meshIndexCount, 1, 0, 0, 0);
                }

                if (wireframeEnabled && wireIndexBuffer && wireIndexCount > 0) {
                    // Overlay pass: draw lines after fill to visualize topology.
                    pass.setPipeline(wirePipeline);
                    pass.setVertexBuffer(0, meshVertexBuffer);
                    pass.setIndexBuffer(wireIndexBuffer, wireIndexFormat);
                    for (var wireDrawIndex = 0; wireDrawIndex < drawList.length; wireDrawIndex++) {
                        var wireSlot = drawList.length + wireDrawIndex;
                        ensureObjectUniformSlot(wireSlot);
                        writeGlobals(objectUniformBuffers[wireSlot], {
                            modelMatrix: drawList[wireDrawIndex].modelMatrix,
                            isBulb: !!drawList[wireDrawIndex].isBulb,
                            color: [0.1, 0.1, 0.1],
                            shadingMode: -3.0,
                            material: null
                        }, drawList[wireDrawIndex].modelMatrix);
                        pass.setBindGroup(0, objectBindGroups[wireSlot]);
                        pass.drawIndexed(wireIndexCount, 1, 0, 0, 0);
                    }
                }
            }

            if (frameEnabled && frameVertexBuffer && frameVertexCount > 0) {
                var frameUniformSlot = drawList.length + ((wireframeEnabled && wireIndexBuffer && wireIndexCount > 0) ? drawList.length : 0);
                ensureObjectUniformSlot(frameUniformSlot);
                writeGlobals(objectUniformBuffers[frameUniformSlot], {
                    isBulb: false,
                    color: [1.0, 1.0, 1.0],
                    shadingMode: -2.0,
                    material: null
                }, mat4());
                pass.setPipeline(framePipeline);
                pass.setBindGroup(0, objectBindGroups[frameUniformSlot]);
                pass.setVertexBuffer(0, frameVertexBuffer);
                pass.draw(frameVertexCount, 1, 0, 0);
            }
            pass.end();

            device.queue.submit([encoder.finish()]);
        }

        function destroy() {
            if (disposed) {
                return;
            }
            disposed = true;
            if (meshVertexBuffer) {
                meshVertexBuffer.destroy();
                meshVertexBuffer = null;
            }
            if (meshIndexBuffer) {
                meshIndexBuffer.destroy();
                meshIndexBuffer = null;
            }
            if (wireIndexBuffer) {
                wireIndexBuffer.destroy();
                wireIndexBuffer = null;
            }
            if (frameVertexBuffer) {
                frameVertexBuffer.destroy();
                frameVertexBuffer = null;
            }
            if (msaaColorTexture) {
                msaaColorTexture.destroy();
                msaaColorTexture = null;
            }
            if (depthTexture) {
                depthTexture.destroy();
                depthTexture = null;
            }
            for (var i = 0; i < objectUniformBuffers.length; i++) {
                if (objectUniformBuffers[i]) {
                    objectUniformBuffers[i].destroy();
                }
            }
            objectUniformBuffers = [];
            objectBindGroups = [];
        }

        result.ready = true;
        result.setGeometry = setGeometry;
        result.setFrameGeometry = setFrameGeometry;
        result.updateScene = updateScene;
        result.renderOnce = renderOnce;
        result.destroy = destroy;

        wgpuSetStatus(statusElem, statusPrefix + " ready: renderer initialized.", "ok");
        return result;
    } catch (error) {
        wgpuSetStatus(statusElem, statusPrefix + " failed: " + error.message, "err");
        console.warn("[WebGPU A2] non-fatal runtime error:", error);
        return result;
    }
}

"use strict";

// =============================================================================
// FRAMEWORK — students do not modify this file.
//
// This file owns the WebGPU plumbing: adapter/device init, compute + blit
// pipelines, ping-pong rgba16float accumulation textures, the Camera and
// Frame uniforms (sample count, frame index, max-bounces, plus the NEE
// and multi-frame accumulation on/off flags), the per-frame render loop,
// and the UI control wiring. Graded tasks live in
// `resources/webgpu-task5.wgsl` (search for `TODO_A5`); ungraded bonus
// extensions live under `BONUS_A5` in the same file.
// =============================================================================

const RUNTIME_LABEL = "WebGPU A5 Student";
const WORKGROUP_SIZE = 8;
const STORAGE_FORMAT = "rgba16float";
const CAMERA_BUFFER_BYTES = 64; // 4 vec4
const FRAME_BUFFER_BYTES = 32;  // 2 vec4: (sampleCount, frameIndex, maxBounces, neeEnabled), (accumEnabled, pad, pad, pad)
const DEFAULT_MAX_BOUNCES = 4;
const DEFAULT_NEE_ENABLED = true;
const DEFAULT_ACCUM_ENABLED = true;

let task5WgslSourcePromise = null;

async function loadTask5WgslSource() {
    if (!task5WgslSourcePromise) {
        task5WgslSourcePromise = fetch("./resources/webgpu-task5.wgsl", { cache: "no-store" }).then(function (response) {
            if (!response.ok) {
                throw new Error("Failed to load webgpu-task5.wgsl (status " + response.status + ")");
            }
            return response.text();
        });
    }
    return task5WgslSourcePromise;
}

function createSceneBuffer(device) {
    const sceneData = packForGPU(CornellBox);
    const buffer = device.createBuffer({
        label: "CornellSceneBuffer",
        size: sceneData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(buffer, 0, sceneData);
    return buffer;
}

function createCameraBuffer(device) {
    return device.createBuffer({
        label: "CameraBuffer",
        size: CAMERA_BUFFER_BYTES,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
}

function createFrameBuffer(device) {
    return device.createBuffer({
        label: "FrameBuffer",
        size: FRAME_BUFFER_BYTES,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
}

function createAccumTexture(device, width, height, label) {
    return device.createTexture({
        label: label,
        size: [width, height, 1],
        format: STORAGE_FORMAT,
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
    });
}

function createBlitSampler(device) {
    return device.createSampler({
        label: "BlitSampler",
        magFilter: "linear",
        minFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge"
    });
}

function createCameraState() {
    return {
        target: [0, 1, 0],
        yaw: 0,
        pitch: 0,
        dist: 4.0,
        fovYdeg: 50.0,
        dirty: true
    };
}

function updateCameraUniform(state, aspect) {
    const cy = Math.cos(state.yaw);
    const sy = Math.sin(state.yaw);
    const cp = Math.cos(state.pitch);
    const sp = Math.sin(state.pitch);
    const eye = [
        state.target[0] + state.dist * sy * cp,
        state.target[1] + state.dist * sp,
        state.target[2] + state.dist * cy * cp
    ];
    const fwd = [
        state.target[0] - eye[0],
        state.target[1] - eye[1],
        state.target[2] - eye[2]
    ];
    const fwdLen = Math.hypot(fwd[0], fwd[1], fwd[2]) || 1;
    fwd[0] /= fwdLen; fwd[1] /= fwdLen; fwd[2] /= fwdLen;

    const worldUp = [0, 1, 0];
    const right = [
        fwd[1] * worldUp[2] - fwd[2] * worldUp[1],
        fwd[2] * worldUp[0] - fwd[0] * worldUp[2],
        fwd[0] * worldUp[1] - fwd[1] * worldUp[0]
    ];
    const rightLen = Math.hypot(right[0], right[1], right[2]) || 1;
    right[0] /= rightLen; right[1] /= rightLen; right[2] /= rightLen;

    const up = [
        right[1] * fwd[2] - right[2] * fwd[1],
        right[2] * fwd[0] - right[0] * fwd[2],
        right[0] * fwd[1] - right[1] * fwd[0]
    ];

    const tanHalfFov = Math.tan((state.fovYdeg * Math.PI / 180) * 0.5);

    const data = new Float32Array(16);
    data[0] = eye[0];   data[1] = eye[1];   data[2] = eye[2];   data[3] = 0;
    data[4] = fwd[0];   data[5] = fwd[1];   data[6] = fwd[2];   data[7] = 0;
    data[8] = right[0] * tanHalfFov * aspect;
    data[9] = right[1] * tanHalfFov * aspect;
    data[10] = right[2] * tanHalfFov * aspect;
    data[11] = 0;
    data[12] = up[0] * tanHalfFov;
    data[13] = up[1] * tanHalfFov;
    data[14] = up[2] * tanHalfFov;
    data[15] = 0;
    return data;
}

function attachCameraInputs(canvas, state, fovSlider, fovValue) {
    let dragging = null;
    let lastX = 0, lastY = 0;
    function markDirty() { state.dirty = true; }

    canvas.addEventListener("mousedown", function (e) {
        dragging = (e.button === 2) ? "dolly" : "orbit";
        lastX = e.clientX; lastY = e.clientY;
        e.preventDefault();
    });
    window.addEventListener("mouseup", function () { dragging = null; });
    window.addEventListener("mousemove", function (e) {
        if (!dragging) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        if (dragging === "orbit") {
            state.yaw -= dx * 0.005;
            state.pitch += dy * 0.005;
            const lim = Math.PI / 2 - 0.05;
            if (state.pitch > lim) state.pitch = lim;
            if (state.pitch < -lim) state.pitch = -lim;
        } else if (dragging === "dolly") {
            state.dist *= Math.exp(dy * 0.005);
            if (state.dist < 0.5) state.dist = 0.5;
            if (state.dist > 20) state.dist = 20;
        }
        markDirty();
    });
    canvas.addEventListener("wheel", function (e) {
        state.dist *= Math.exp(e.deltaY * 0.001);
        if (state.dist < 0.5) state.dist = 0.5;
        if (state.dist > 20) state.dist = 20;
        markDirty();
        e.preventDefault();
    }, { passive: false });
    canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });

    if (fovSlider) {
        fovSlider.addEventListener("input", function () {
            state.fovYdeg = Number(fovSlider.value);
            if (fovValue) fovValue.textContent = state.fovYdeg.toFixed(0) + "°";
            markDirty();
        });
    }
}

function attachRendererControls(canvas, state, cameraState) {
    const bouncesSlider = document.getElementById("bouncesSlider");
    const bouncesValue = document.getElementById("bouncesValue");
    const resetButton = document.getElementById("resetButton");
    const saveRenderButton = document.getElementById("saveRenderButton");
    const neeToggle = document.getElementById("neeToggle");

    if (bouncesSlider) {
        bouncesSlider.value = String(state.maxBounces);
        if (bouncesValue) bouncesValue.textContent = String(state.maxBounces);
        bouncesSlider.addEventListener("input", function () {
            state.maxBounces = Math.max(1, Math.min(8, Number(bouncesSlider.value) | 0));
            if (bouncesValue) bouncesValue.textContent = String(state.maxBounces);
            cameraState.dirty = true;
        });
    }
    if (neeToggle) {
        neeToggle.checked = !!state.neeEnabled;
        neeToggle.addEventListener("input", function () {
            state.neeEnabled = !!neeToggle.checked;
            cameraState.dirty = true;
        });
    }
    const accumToggle = document.getElementById("accumToggle");
    if (accumToggle) {
        accumToggle.checked = !!state.accumEnabled;
        accumToggle.addEventListener("input", function () {
            state.accumEnabled = !!accumToggle.checked;
            cameraState.dirty = true;
        });
    }
    if (resetButton) {
        resetButton.addEventListener("click", function () {
            cameraState.dirty = true;
        });
    }
    if (saveRenderButton) {
        saveRenderButton.addEventListener("click", function () {
            canvas.toBlob(function (blob) {
                if (!blob) return;
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "reference_render.png";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, "image/png");
        });
    }
}

async function bootstrap(canvas, statusElem) {
    const init = await wgpuInitCanvasContext(canvas, statusElem, RUNTIME_LABEL);
    if (!init) {
        return null;
    }

    const device = init.device;
    const wgsl = await loadTask5WgslSource();
    const shaderModule = device.createShaderModule({
        label: "ShaderModule",
        code: wgsl
    });

    const computePipeline = device.createComputePipeline({
        label: "ComputePipeline",
        layout: "auto",
        compute: { module: shaderModule, entryPoint: "cs_main" }
    });

    const blitPipeline = device.createRenderPipeline({
        label: "BlitPipeline",
        layout: "auto",
        vertex: { module: shaderModule, entryPoint: "vs_main" },
        fragment: {
            module: shaderModule,
            entryPoint: "fs_main",
            targets: [{ format: init.format }]
        },
        primitive: { topology: "triangle-list" }
    });

    const sceneBuffer = createSceneBuffer(device);
    const cameraBuffer = createCameraBuffer(device);
    const frameBuffer = createFrameBuffer(device);
    const blitSampler = createBlitSampler(device);

    const cameraState = createCameraState();
    const fovSlider = document.getElementById("fovSlider");
    const fovValue = document.getElementById("fovValue");
    if (fovSlider) {
        fovSlider.value = String(cameraState.fovYdeg);
        if (fovValue) fovValue.textContent = cameraState.fovYdeg.toFixed(0) + "°";
    }
    attachCameraInputs(canvas, cameraState, fovSlider, fovValue);

    const sppDisplay = document.getElementById("sppDisplay");
    const frameDisplay = document.getElementById("frameDisplay");

    const state = {
        canvas: canvas,
        device: device,
        context: init.context,
        format: init.format,
        computePipeline: computePipeline,
        blitPipeline: blitPipeline,
        sceneBuffer: sceneBuffer,
        cameraBuffer: cameraBuffer,
        frameBuffer: frameBuffer,
        blitSampler: blitSampler,
        cameraState: cameraState,
        sampleCount: 0,
        frameIndex: 0,
        maxBounces: DEFAULT_MAX_BOUNCES,
        neeEnabled: DEFAULT_NEE_ENABLED,
        accumEnabled: DEFAULT_ACCUM_ENABLED,
        accumTextures: [null, null],
        accumViews: [null, null],
        computeBindGroups: [null, null],
        blitBindGroups: [null, null],
        targetSize: [0, 0]
    };

    attachRendererControls(canvas, state, cameraState);

    function ensureStorageTargets() {
        const w = Math.max(1, canvas.width | 0);
        const h = Math.max(1, canvas.height | 0);
        if (state.accumTextures[0] && state.targetSize[0] === w && state.targetSize[1] === h) {
            return;
        }
        for (let i = 0; i < 2; i++) {
            if (state.accumTextures[i]) state.accumTextures[i].destroy();
            state.accumTextures[i] = createAccumTexture(device, w, h, "AccumTexture-" + i);
            state.accumViews[i] = state.accumTextures[i].createView();
        }
        state.targetSize = [w, h];

        // computeBindGroups[readIdx]: read accumViews[readIdx], write accumViews[1-readIdx].
        for (let readIdx = 0; readIdx < 2; readIdx++) {
            const writeIdx = 1 - readIdx;
            state.computeBindGroups[readIdx] = device.createBindGroup({
                label: "ComputeBindGroup-read" + readIdx,
                layout: computePipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: state.accumViews[writeIdx] },
                    { binding: 3, resource: { buffer: cameraBuffer } },
                    { binding: 4, resource: { buffer: sceneBuffer } },
                    { binding: 5, resource: { buffer: frameBuffer } },
                    { binding: 6, resource: state.accumViews[readIdx] }
                ]
            });
        }
        for (let i = 0; i < 2; i++) {
            state.blitBindGroups[i] = device.createBindGroup({
                label: "BlitBindGroup-" + i,
                layout: blitPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 1, resource: state.accumViews[i] },
                    { binding: 2, resource: blitSampler }
                ]
            });
        }

        // Resize counts as a reset.
        cameraState.dirty = true;
    }

    function frame() {
        ensureStorageTargets();

        if (cameraState.dirty) {
            state.sampleCount = 0;
            cameraState.dirty = false;
        }
        state.sampleCount = (state.sampleCount + 1) | 0;
        state.frameIndex = (state.frameIndex + 1) | 0;

        const aspect = state.targetSize[0] / Math.max(1, state.targetSize[1]);
        const cameraData = updateCameraUniform(cameraState, aspect);
        device.queue.writeBuffer(cameraBuffer, 0, cameraData);

        const frameData = new Float32Array(8);
        frameData[0] = state.sampleCount;
        frameData[1] = state.frameIndex % (1 << 24);
        frameData[2] = state.maxBounces;
        frameData[3] = state.neeEnabled ? 1.0 : 0.0;
        frameData[4] = state.accumEnabled ? 1.0 : 0.0;
        // frameData[5..7] are pad slots in the second vec4.
        device.queue.writeBuffer(frameBuffer, 0, frameData);

        const writeIdx = state.sampleCount % 2;
        const readIdx = 1 - writeIdx;

        const encoder = device.createCommandEncoder({ label: "Encoder" });

        const computePass = encoder.beginComputePass({ label: "ComputePass" });
        computePass.setPipeline(computePipeline);
        computePass.setBindGroup(0, state.computeBindGroups[readIdx]);
        const wgX = Math.ceil(state.targetSize[0] / WORKGROUP_SIZE);
        const wgY = Math.ceil(state.targetSize[1] / WORKGROUP_SIZE);
        computePass.dispatchWorkgroups(wgX, wgY, 1);
        computePass.end();

        const blitPass = encoder.beginRenderPass({
            label: "BlitPass",
            colorAttachments: [{
                view: state.context.getCurrentTexture().createView(),
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                loadOp: "clear",
                storeOp: "store"
            }]
        });
        blitPass.setPipeline(blitPipeline);
        blitPass.setBindGroup(0, state.blitBindGroups[writeIdx]);
        blitPass.draw(3, 1, 0, 0);
        blitPass.end();

        device.queue.submit([encoder.finish()]);

        if (sppDisplay) sppDisplay.textContent = String(state.sampleCount);
        if (frameDisplay) frameDisplay.textContent = String(state.frameIndex);

        window.requestAnimationFrame(frame);
    }

    window.requestAnimationFrame(frame);
    console.log("[" + RUNTIME_LABEL + "] ray tracer live: SPP=8 inline, NEE direct + book-1 indirect + multi-frame accumulation toggle, Reinhard tone map.");
    return state;
}

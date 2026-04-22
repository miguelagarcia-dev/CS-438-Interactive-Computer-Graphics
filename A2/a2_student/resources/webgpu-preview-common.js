"use strict";

// ----------------------------------------------------------------------------
// Shared WebGPU helpers for Assignment 2.
// Keeps renderer setup code out of task2.js so students can focus on CG logic.
function wgpuSetStatus(statusElem, message, level) {
    if (!statusElem) {
        return;
    }
    statusElem.textContent = message;
    statusElem.className = "statusline";
    if (level === "ok") {
        statusElem.classList.add("ok");
    } else if (level === "warn") {
        statusElem.classList.add("warn");
    } else if (level === "err") {
        statusElem.classList.add("err");
    }
}

async function wgpuInitCanvasContext(canvas, statusElem, labelPrefix) {
    if (!canvas) {
        wgpuSetStatus(statusElem, labelPrefix + ": canvas not found.", "err");
        return null;
    }

    if (!("gpu" in navigator)) {
        wgpuSetStatus(statusElem, labelPrefix + ": navigator.gpu is not available in this browser.", "warn");
        return null;
    }

    try {
        wgpuSetStatus(statusElem, labelPrefix + ": requesting adapter/device...", "warn");

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            wgpuSetStatus(statusElem, labelPrefix + ": no adapter returned.", "err");
            return null;
        }

        const device = await adapter.requestDevice();
        const context = canvas.getContext("webgpu");
        if (!context) {
            wgpuSetStatus(statusElem, labelPrefix + ": failed to acquire webgpu context.", "err");
            return null;
        }

        const format = navigator.gpu.getPreferredCanvasFormat();
        context.configure({
            device: device,
            format: format,
            // Premultiplied alpha is the browser default and stable for canvas composition.
            alphaMode: "premultiplied"
        });

        console.log("[" + labelPrefix + "] Device acquired.");
        console.log("[" + labelPrefix + "] Canvas format:", format);

        return {
            adapter: adapter,
            device: device,
            context: context,
            format: format
        };
    } catch (error) {
        wgpuSetStatus(statusElem, labelPrefix + " failed: " + error.message, "err");
        return null;
    }
}

// Compatibility aliases: keep legacy names valid for existing call sites.
function a2WgpuSetStatus(statusElem, message, level) {
    return wgpuSetStatus(statusElem, message, level);
}

async function a2WgpuInitCanvasContext(canvas, statusElem, labelPrefix) {
    return wgpuInitCanvasContext(canvas, statusElem, labelPrefix);
}

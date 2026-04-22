"use strict";

// -----------------------------------------------------------------------------
function studentdata() {

    //*** TODO_A3 : insert your data below ***
    const lastname = 'Garcia';
    const firstname = 'Miguel';
    document.getElementById("author").innerText = ("Author: ").concat(lastname, ", ", firstname);
    document.getElementById("title").innerText = ("A3 | ").concat(lastname, ", ", firstname);
}

// -----------------------------------------------------------------------------
// Main function of the assignment runtime.
function main() {
    studentdata();

    const canvas = document.getElementById("canvas");
    const runtimeLabel = "WebGPU A3 Student";

    console.log("[" + runtimeLabel + "] running WebGPU-only path.");

    // -------------------------------------------------------------------------
    // Shared DOM lookups for per-frame state snapshots.
    function getElement(id) {
        return document.getElementById(id);
    }

    const ui = {
        speedSlider: getElement("speedSlider"),
        rotZSlider: getElement("rotZSlider"),
        fovySlider: getElement("fovySlider"),
        nearSlider: getElement("nearSlider"),
        farSlider: getElement("farSlider"),
        projectionSelect: getElement("projectionSelect"),
        lightSlider: getElement("lightSlider"),
        lightColor: getElement("lightColor"),
        lightRotXSlider: getElement("lightRotXSlider"),
        lightRotZSlider: getElement("lightRotZSlider"),
        lightDistSlider: getElement("lightDistSlider"),
        drawObj1: getElement("drawObj1"),
        drawObj2: getElement("drawObj2"),
        drawObj3: getElement("drawObj3"),
        drawBulb: getElement("drawBulb"),
        drawFrame: getElement("drawFrame"),
        drawWire: getElement("drawWire"),
        shadingSelect: getElement("shadingSelect"),
        obj1MeshSelect: getElement("obj1MeshSelect"),
        obj2MeshSelect: getElement("obj2MeshSelect"),
        obj3MeshSelect: getElement("obj3MeshSelect"),
        resSlider: getElement("resSlider"),
        depthCheck: getElement("depthCheck"),
        cullface: getElement("cullface"),
        frontface: getElement("frontface"),
        bgdColor: getElement("bgdColor"),
        diffuseMap: getElement("diffuseMap"),
        normalMap: getElement("normalMap"),
        diffMinFilter: getElement("diffMinFilter"),
        diffMagFilter: getElement("diffMagFilter"),
        normMinFilter: getElement("normMinFilter"),
        normMagFilter: getElement("normMagFilter"),
        webgpuStatus: getElement("webgpuStatus")
    };

    function readNumber(elem, fallbackValue) {
        const value = Number(elem.value);
        return Number.isFinite(value) ? value : fallbackValue;
    }

    function readColorRgba(elem) {
        const rgb = hexToRgb(elem.value);
        return [rgb[0], rgb[1], rgb[2], 1.0];
    }

    // -------------------------------------------------------------------------
    // Animation timing state.
    const timings = {
        speed: 0,
        then: 0,
        step: 0,
        day: 0,
        sunday: 0,
        month: 0,
        year: 0,
        update: function (now) {
            this.speed = readNumber(ui.speedSlider, 0);
            now *= 0.001;
            const delta = now - this.then;
            this.then = now;
            this.step += this.speed * delta;
            this.day = 36.0 * this.step;
            this.sunday = this.day / 24;
            this.month = this.day / 30;
            this.year = this.day / 360;
        }
    };

    // -------------------------------------------------------------------------
    // Material manager: keeps material data and binds the GUI controls.
    const materialManager = new function () {
        const materials = {
            "Test Material": {
                colors: { "ka": [0.1, 0.1, 0.1], "kd": [0.5, 0.5, 0.5], "ks": [0.2, 0.2, 0.2] },
                qs: 2,
                diffPath: "./texture/checker1.jpg",
                normPath: "./texture/bump_normal.png"
            },
            "Normal Map": {
                colors: { "ka": [0.1, 0.1, 0.1], "kd": [0.5, 0.5, 0.5], "ks": [0.2, 0.2, 0.2] },
                qs: 12,
                diffPath: "./texture/DisplacementMap.png",
                normPath: "./texture/NormalMap.png"
            },
            "Reddish": {
                colors: { "ka": [0.1, 0.1, 0.1], "kd": [0.8, 0.1, 0.1], "ks": [0.2, 0.2, 0.2] },
                qs: 12
            },
            "Face2": {
                colors: { "ka": [0.01, 0.01, 0.01], "kd": [0.5, 0.5, 0.5], "ks": [0.08, 0.08, 0.08] },
                qs: 50,
                diffPath: "./texture/head2_diffuse.jpg",
                normPath: "./texture/head2_normal.jpg"
            },
            "Metal Plate": {
                // ************************************************************************
                // *** TODO_A3 : Task 4 ***
                //
                // Create or find your own diffuse texture for your material.
                // Copy this texture to the ./textures/ folder. Further,
                // add your texture to the Custom Material (you can rename it) in the material manager
                // (search for TODO_A3 Task 4) in the 'task3.js' file.
                //
                // Create or find a corresponding normal map.
                // You can use tools like Normal Map Online or Crazybump or other (search in the web) for this task.
                // Also add this texture to your material.
                //
                // Document your work and be creative!
                colors: { "ka": [0.1, 0.1, 0.1], "kd": [0.5, 0.5, 0.5], "ks": [0.2, 0.2, 0.2] },
                qs: 10,
                diffPath: "./texture/metal_plate_diff_4k.jpg",
                normPath: "./texture/metal_plate_nor_dx_4k.jpg"
            },
            "Scales": {
                colors: { "ka": [0.1, 0.1, 0.1], "kd": [0.5, 0.5, 0.5], "ks": [0.2, 0.2, 0.2] },
                qs: 10,
                diffPath: "./texture/scales.jpg",
                normPath: "./texture/scales_normal.jpg"
            },
            "Dirt": {
                colors: { "ka": [0.1, 0.1, 0.1], "kd": [0.5, 0.5, 0.5], "ks": [0.2, 0.2, 0.2] },
                qs: 10,
                diffPath: "./texture/dirt_diffuse.jpg",
                normPath: "./texture/dirt_normal.jpg"
            },
            "Wood": {
                colors: { "ka": [0.1, 0.1, 0.1], "kd": [0.5, 0.5, 0.5], "ks": [0.2, 0.2, 0.2] },
                qs: 2,
                diffPath: "./texture/wood.jpg",
                normPath: "./texture/wood_dot3.png"
            }
        };

        const textureFilters = {
            "Nearest": 0x2600,
            "Linear": 0x2601,
            "Nearest Nearest": 0x2700,
            "Nearest Linear": 0x2702,
            "Linear Nearest": 0x2701,
            "Trilinear": 0x2703
        };

        let activeMaterial = null;

        function setGuiColor(component, color) {
            getElement(component + "Color").value = rgbToHex(color);
            getElement(component + "R").innerHTML = color[0].toFixed(2);
            getElement(component + "G").innerHTML = color[1].toFixed(2);
            getElement(component + "B").innerHTML = color[2].toFixed(2);
        }

        function setActiveMaterial(name) {
            const mat = materials[name];
            activeMaterial = mat;
            getElement("qsSlider").value = Number(mat.qs);
            getElement("qsValue").innerHTML = Number(mat.qs).toPrecision(4);
            setGuiColor("ka", mat.colors.ka);
            setGuiColor("kd", mat.colors.kd);
            setGuiColor("ks", mat.colors.ks);
        }

        function addMaterialOptions() {
            Object.keys(materials).forEach(function (name) {
                const option = document.createElement("option");
                option.value = name;
                option.text = name;
                option.className = "uibox";
                getElement("materialSelect").add(option);
                getElement("obj1MatSelect").add(option.cloneNode(true));
                getElement("obj2MatSelect").add(option.cloneNode(true));
                getElement("obj3MatSelect").add(option.cloneNode(true));
            });
        }

        function addTextureFilterOptions() {
            Object.keys(textureFilters).forEach(function (key) {
                const option = document.createElement("option");
                option.value = textureFilters[key];
                option.text = key;
                option.className = "uibox";
                getElement("diffMinFilter").add(option);
                getElement("normMinFilter").add(option.cloneNode(true));
                if (key.length < 8) {
                    getElement("diffMagFilter").add(option.cloneNode(true));
                    getElement("normMagFilter").add(option.cloneNode(true));
                }
            });
        }

        function bindMaterialGuiEvents() {
            getElement("materialSelect").onchange = function (event) {
                setActiveMaterial(event.target.value);
            };

            getElement("qsSlider").oninput = function (event) {
                activeMaterial.qs = Number(event.target.value);
                getElement("qsValue").innerHTML = Number(event.target.value).toPrecision(4);
            };

            getElement("kaColor").oninput = function (event) {
                activeMaterial.colors.ka = hexToRgb(event.target.value);
                setGuiColor("ka", activeMaterial.colors.ka);
            };

            getElement("kdColor").oninput = function (event) {
                activeMaterial.colors.kd = hexToRgb(event.target.value);
                setGuiColor("kd", activeMaterial.colors.kd);
            };

            getElement("ksColor").oninput = function (event) {
                activeMaterial.colors.ks = hexToRgb(event.target.value);
                setGuiColor("ks", activeMaterial.colors.ks);
            };
        }

        function initializeDefaults() {
            setActiveMaterial("Test Material");
            getElement("obj1MatSelect").value = "Test Material";
            getElement("obj2MatSelect").value = "Test Material";
            getElement("obj3MatSelect").value = "Test Material";
        }

        this.getMaterialSnapshot = function (name) {
            const mat = materials[name];
            if (!mat) return null;
            return {
                name: name,
                ka: mat.colors.ka.slice(),
                kd: mat.colors.kd.slice(),
                ks: mat.colors.ks.slice(),
                qs: Number(mat.qs),
                diffPath: mat.diffPath || null,
                normPath: mat.normPath || null
            };
        };

        this.getSelectedMaterialSnapshots = function () {
            const fallback = this.getMaterialSnapshot("Test Material");
            function readObjectMaterial(selectId, getter) {
                const selectElem = getElement(selectId);
                const selectedName = selectElem ? selectElem.value : "";
                return getter(selectedName) || fallback;
            }
            return {
                obj1Material: readObjectMaterial("obj1MatSelect", this.getMaterialSnapshot.bind(this)),
                obj2Material: readObjectMaterial("obj2MatSelect", this.getMaterialSnapshot.bind(this)),
                obj3Material: readObjectMaterial("obj3MatSelect", this.getMaterialSnapshot.bind(this))
            };
        };

        addMaterialOptions();
        addTextureFilterOptions();
        bindMaterialGuiEvents();
        initializeDefaults();
    }();

    // -------------------------------------------------------------------------
    // Camera controls.
    const camera = new function () {
        const mouse = new MouseTracker(-2.001, 25);

        this.viewMatrix = function (eye = vec3(0, 0, 0.001), at = vec3(0, 0, 0), up = vec3(0, 1, 0)) {
            const rotX = -mouse.rotx();
            const rotY = -mouse.roty();
            const rotZ = readNumber(ui.rotZSlider, 0);
            const dist = 2 + mouse.dist();

            const cameraTransform = [rotateX(rotX), rotateY(rotY), translate(0, 0, dist)].reduce(mult);
            const transformedEye = mult(cameraTransform, vec4(eye, 1)).splice(0, 3);
            const transformedUp = mult(mult(cameraTransform, rotateZ(rotZ)), vec4(up, 0)).splice(0, 3);
            return lookAt(transformedEye, at, transformedUp);
        };

        this.projMatrix = function () {
            const fovy = readNumber(ui.fovySlider, 90);
            const near = readNumber(ui.nearSlider, 0.1);
            const far = readNumber(ui.farSlider, 10);
            const dist = 2 + mouse.dist();
            const aspectRatio = canvas.width / canvas.height;
            const projection = ui.projectionSelect.value;

            if (projection === "ortho") {
                const w = dist * Math.tan(radians(fovy) / 2) + 0.0001;
                return ortho(-aspectRatio * w, +aspectRatio * w, -w, +w, near, far);
            }

            const w = near * Math.tan(radians(fovy) / 2) + 0.0001;
            return frustum(-aspectRatio * w, aspectRatio * w, -w, w, near, far);
        };
    }();

    // -------------------------------------------------------------------------
    // Light controls.
    const light = new function () {
        this.modelMatrix = function () {
            const rotX = readNumber(ui.lightRotXSlider, 66);
            const rotZ = readNumber(ui.lightRotZSlider, -16);
            const dist = readNumber(ui.lightDistSlider, 3.5);
            return [rotateX(rotX), rotateZ(rotZ), translate(0, dist, 0)].reduce(mult);
        };

        this.color = function () {
            const intensity = readNumber(ui.lightSlider, 1.0);
            const rgb = hexToRgb(ui.lightColor.value);
            return rgb.map(function (x) { return intensity * x; });
        };
    }();

    // -------------------------------------------------------------------------
    // WebGPU bootstrap and sync helpers.
    function bootstrapWebGPUPreview() {
        bootstrapTask3WebGPUPreview().catch(function (error) {
            console.warn("[" + runtimeLabel + "] non-fatal bootstrap error:", error);
            wgpuSetStatus(ui.webgpuStatus, runtimeLabel + " bootstrap failed: " + String(error), "error");
        });
    }

    function buildSceneStatePatch(viewMatrix, projMatrix, sunMatrix, earthMatrix, moonMatrix, lightModelMatrix, lightPosVS, lightColor) {
        const materials = materialManager.getSelectedMaterialSnapshots();
        return {
            viewMatrix: viewMatrix,
            projMatrix: projMatrix,
            clearColor: readColorRgba(ui.bgdColor),
            obj1Mesh: ui.obj1MeshSelect.value,
            obj2Mesh: ui.obj2MeshSelect.value,
            obj3Mesh: ui.obj3MeshSelect.value,
            res: Number(ui.resSlider.value),
            timings: {
                day: timings.day,
                month: timings.month,
                year: timings.year,
                sunday: timings.sunday
            },
            sunMatrix: sunMatrix,
            earthMatrix: earthMatrix,
            moonMatrix: moonMatrix,
            drawObj1: ui.drawObj1.checked,
            drawObj2: ui.drawObj2.checked,
            drawObj3: ui.drawObj3.checked,
            drawBulb: ui.drawBulb.checked,
            drawFrame: ui.drawFrame.checked,
            drawWire: ui.drawWire.checked,
            shadingMode: Number(ui.shadingSelect.value),
            depthEnabled: ui.depthCheck.checked,
            cullFace: ui.cullface.value,
            frontFace: ui.frontface.value,
            diffuseMapEnabled: ui.diffuseMap.checked,
            normalMapEnabled: ui.normalMap.checked,
            diffMinFilter: ui.diffMinFilter.value,
            diffMagFilter: ui.diffMagFilter.value,
            normMinFilter: ui.normMinFilter.value,
            normMagFilter: ui.normMagFilter.value,
            obj1Material: materials.obj1Material,
            obj2Material: materials.obj2Material,
            obj3Material: materials.obj3Material,
            lightModelMatrix: lightModelMatrix,
            lightPosVS: lightPosVS,
            lightCol: lightColor
        };
    }

    function syncWebGPUPreviewFrame(scenePatch) {
        try {
            syncTask3WebGPUPreview(scenePatch);
        } catch (error) {
            console.warn("[" + runtimeLabel + "] non-fatal sync error:", error);
        }
    }

    // -------------------------------------------------------------------------
    // Runtime loop.
    bootstrapWebGPUPreview();
    window.requestAnimationFrame(render);

    function render(now) {
        timings.update(now);

        const viewMatrix = camera.viewMatrix();
        const projMatrix = camera.projMatrix();

        const lightModelMatrix = light.modelMatrix();
        const lightModelView = mult(viewMatrix, lightModelMatrix);
        const lightPosVS = mult(lightModelView, [0, 0, 0, 1]).splice(0, 3);
        const lightColor = light.color();

        const sunMatrix = [rotateY(timings.sunday), scalem(0.65, 0.65, 0.65)].reduce(mult);
        const earthMatrix = [
            rotateY(timings.year),
            translate(1.8, 0.0, 0.0),
            rotateY(-timings.year),
            rotateZ(-23.44),
            rotateY(timings.day)
        ].reduce(mult);
        const moonMatrix = [
            rotateY(timings.year),
            translate(1.8, 0.0, 0.0),
            rotateZ(5.14),
            rotateY(timings.month),
            translate(0.6, 0, 0)
        ].reduce(mult);

        const scenePatch = buildSceneStatePatch(
            viewMatrix,
            projMatrix,
            sunMatrix,
            earthMatrix,
            moonMatrix,
            lightModelMatrix,
            lightPosVS,
            lightColor
        );
        syncWebGPUPreviewFrame(scenePatch);

        window.requestAnimationFrame(render);
    }
}

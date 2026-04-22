"use strict"
// ----------------------------------------------------------------------------
// CS 438 / CS 657 - Assignment 2
// Main application script:
// - reads GUI values,
// - builds camera/object/light transforms,
// - sends one frame description to the WebGPU runtime.
const TASKS = true;

// ----------------------------------------------------------------------------  
function studentdata() {

    //*** TODO_A2 : insert your data below ***
    const lastname = 'Garcia';
    const firstname = 'Miguel';
    document.getElementById("author").innerText = ("Author: ").concat(lastname, ", ", firstname);
    document.getElementById("title").innerText = ("A2 | ").concat(lastname, ", ", firstname);
}

// ----------------------------------------------------------------------------
// WebGPU preview bootstrap.
// Keep this fully isolated: any WebGPU failure must not break the page.
function launchTask2WebGPUPreview() {
    const previewCanvas = document.getElementById("webgpuCanvas");
    const statusElem = document.getElementById("webgpuStatus");
    if (!previewCanvas || !statusElem) {
        return Promise.resolve(null);
    }

    if (typeof runTask2WebGPUPreview !== "function") {
        statusElem.textContent = "WebGPU: bootstrap script not loaded.";
        statusElem.className = "statusline warn";
        return Promise.resolve(null);
    }

    try {
        const handlePromise = Promise.resolve(runTask2WebGPUPreview(previewCanvas, statusElem));
        handlePromise.catch(function (error) {
            statusElem.textContent = "WebGPU failed: " + error.message;
            statusElem.className = "statusline err";
            console.warn("[A2 WebGPU] non-fatal bootstrap error:", error);
        });
        return handlePromise.then(function (handle) {
            if (handle && handle.ready) {
                return handle;
            }
            return null;
        }).catch(function () {
            return null;
        });
    } catch (error) {
        statusElem.textContent = "WebGPU failed: " + error.message;
        statusElem.className = "statusline err";
        console.warn("[A2 WebGPU] non-fatal bootstrap error:", error);
        return Promise.resolve(null);
    }
}

// ----------------------------------------------------------------------------
// WebGPU scene sync helper.
function syncTask2WebGPUCameraAndRender(handle, frameState) {
    if (!handle || !handle.ready || !frameState) {
        return;
    }

    // Build scene objects in the same draw order used by the assignment:
    // bulb, object 1 (sun), object 2 (earth), object 3 (moon).
    const sceneObjects = [];
    if (frameState.drawBulbEnabled && frameState.lightModelMatrix) {
        sceneObjects.push({ visible: true, modelMatrix: frameState.lightModelMatrix, isBulb: true, color: frameState.lightColor });
    }
    if (frameState.drawObj1Enabled) {
        let obj1Matrix = mat4();
        obj1Matrix = mult(obj1Matrix, rotateY(frameState.timings.sunday));
        obj1Matrix = mult(obj1Matrix, scalem(0.5, 0.5, 0.5));
        sceneObjects.push({ visible: true, modelMatrix: obj1Matrix, material: frameState.obj1Material });
    }
    if (frameState.drawObj2Enabled) {
        let obj2Matrix = mat4();
        // Earth-style chain: orbit around origin + axial tilt + self rotation + scale.
        obj2Matrix = mult(obj2Matrix, rotateY(frameState.timings.year));
        obj2Matrix = mult(obj2Matrix, translate(1.8, 0.0, 0.0));
        obj2Matrix = mult(obj2Matrix, rotateY(-frameState.timings.year));
        obj2Matrix = mult(obj2Matrix, rotateZ(-23.44));
        obj2Matrix = mult(obj2Matrix, rotateY(frameState.timings.day));
        obj2Matrix = mult(obj2Matrix, scalem(0.4, 0.4, 0.4));
        sceneObjects.push({ visible: true, modelMatrix: obj2Matrix, material: frameState.obj2Material });
    }
    if (frameState.drawObj3Enabled) {
        let obj3Matrix = mat4();
        // Moon-style chain: follow object-2 orbit, then local orbit and scale.
        obj3Matrix = mult(obj3Matrix, rotateY(frameState.timings.year));
        obj3Matrix = mult(obj3Matrix, translate(1.8, 0.0, 0.0));
        obj3Matrix = mult(obj3Matrix, rotateZ(5.14));
        obj3Matrix = mult(obj3Matrix, rotateY(frameState.timings.month));
        obj3Matrix = mult(obj3Matrix, translate(0.9, 0, 0));
        obj3Matrix = mult(obj3Matrix, scalem(0.4, 0.4, 0.4));
        sceneObjects.push({ visible: true, modelMatrix: obj3Matrix, material: frameState.obj3Material });
    }

    if (typeof handle.updateScene === "function") {
        handle.updateScene({
            viewMatrix: frameState.viewMatrix,
            projMatrix: frameState.projMatrix,
            modelMatrix: mat4(),
            drawEnabled: sceneObjects.length > 0,
            sceneObjects: sceneObjects,
            frameEnabled: frameState.drawFrameEnabled,
            wireframeEnabled: frameState.drawWireEnabled,
            lightPosVS: frameState.lightPosVS,
            lightColor: frameState.lightColor,
            shadingMode: frameState.shadingMode
        });
    }

    if (typeof handle.renderOnce === "function") {
        handle.renderOnce();
    }
}

// ----------------------------------------------------------------------------
// Main function of the A2 runtime.
// It contains further functions as nested functions used for rendering.
// This avoids the usage of global variables: all variables can be 
// defined in the main function. 
function main() {

    // ----------------------------------------------------------------------------
    // set student data
    studentdata();

    // ----------------------------------------------------------------------------
    // initialize isolated WebGPU preview (WebGPU is the only active runtime in a3_solved_student)
    let webgpuHandle = null;
    const webgpuHandlePromise = launchTask2WebGPUPreview();

    const previewCanvas = document.getElementById("webgpuCanvas");

    // ----------------------------------------------------------------------------
    // initialize scene objects
    let geometryResolution = 1;
    let geometry = sphereGeometry(5 * geometryResolution, 10 * geometryResolution);
    let coordFrame = coordinateFrame();

    function syncGeometryToWebGPU() {
        if (!webgpuHandle || !webgpuHandle.ready) {
            return;
        }
        if (typeof webgpuHandle.setGeometry === "function") {
            webgpuHandle.setGeometry(geometry);
        }
        if (typeof webgpuHandle.setFrameGeometry === "function") {
            webgpuHandle.setFrameGeometry(coordFrame);
        }
    }

    if (webgpuHandlePromise && typeof webgpuHandlePromise.then === "function") {
        webgpuHandlePromise.then(function (handle) {
            if (!handle || !handle.ready) {
                return;
            }
            webgpuHandle = handle;
            syncGeometryToWebGPU();
        }).catch(function () {
            webgpuHandle = null;
        });
    }

    // ----------------------------------------------------------------------------
    // register GUI events

    document.getElementById("geometrySelect").onchange = function () {
        switch (document.getElementById("geometrySelect").value) {
            default:
            case "cube":
                geometry = cubeGeometry();
                break;
            case "sphere":
                geometry = sphereGeometry(5 * geometryResolution, 10 * geometryResolution);
                break;
            case "teapot":
                geometry = teapotGeometry();
                break;
            case "bunny":
                geometry = importObj(bunnyobj_pvn);
                break;
        }
        syncGeometryToWebGPU();
    };

    document.getElementById("resSlider").oninput = function () {
        geometryResolution = Number(document.getElementById("resSlider").value);
        if (document.getElementById("geometrySelect").value === "sphere") {
            geometry = sphereGeometry(5 * geometryResolution, 10 * geometryResolution);
            syncGeometryToWebGPU();
        }
    };

    // ----------------------------------------------------------------------------
    // create and init objects used in the scene

    let timings = {
        speed: 10,
        then: 0,
        step: 0,
        day: 0,
        sunday: 0,
        month: 0,
        year: 0,
        update: function (now) {
            now *= 0.001;
            let delta = now - this.then;
            this.then = now;
            this.step += this.speed * delta;
            // day is the base angular clock, all other motions derive from it.
            this.day = 36.0 * this.step;
            this.sunday = this.day / 24;
            this.month = this.day / 30;
            this.year = this.day / 360;
        }
    };

    document.getElementById("speedSlider").oninput = function (event) {
        timings.speed = Number(event.target.value);
    };

    let camera = {

        viewMatrix: function () {

            let rotx = Number(document.getElementById("rotXSlider").value);
            let roty = Number(document.getElementById("rotYSlider").value);
            let rotup = Number(document.getElementById("rotZSlider").value);
            let dist = Number(document.getElementById("distSlider").value);

            // *** TODO_A2 *** Task 1a ***
            // Implement the view-transformation matrix of the camera. Given the values of
            // rotx, roty, rotup, dist, implement a simple control of the location of
            // the camera by computing a transformation matrix for the eye location and
            // the up vector.
            // To create this transformation, you would need to multiply a number of transforms,
            // and subsequently use it for transforming eye and up.

            // Hints:
            //  - you can create rotation matrices using the helper-functions in 'math.js'.
            //  - you can multiply a 4x4 matrix with a 3d point/vector by extending the point/vector
            //    to a 4d point/vector using the vec4 structure.
            //  - you can get a 3d point/vector from a 4d structure using the .splice(0,3) function, e.g.,
            //
            //    let x = vec4();          // defines a 4d structure
            //    let y = x.splice(0,3);   // returns first 3 components of x and provides a 3d structure

            // *** begin code, replace the code below 

            // WHhat we're doing is building a transform that
            // places the camera at a distance from the origin, then rotates it
            // around using the slider values, rotx tilts up/down, roty swings
            // left/right, and rotup spins the camera roll.
            // the translation moves the camera out along Z first, then the rotations
            // swing it into the right position around the scene.
            let M = mult(mult(mult(rotateX(rotx), rotateY(roty)), rotateZ(rotup)), translate(0, 0, dist));

            // from M we can get where the eye ends up and which way is "up"
            // eye is just the origin point after being pushed and rotated
            // up is the Y-axis direction after the same rotation (w=0 means it's a direction, not a point)
            let eye = mult(M, vec4(0, 0, 0, 1)).splice(0, 3);
            let up  = mult(M, vec4(0, 1, 0, 0)).splice(0, 3);
            let at  = vec3(0, 0, 0); // always looking at the origin

            return lookAt(eye, at, up);

            // *** end code
        },

        projMatrix: function () {

            let fovy = Number(document.getElementById("fovySlider").value);
            let near = Number(document.getElementById("nearSlider").value);
            let far = Number(document.getElementById("farSlider").value);
            let dist = Number(document.getElementById("distSlider").value);
            let aspectRatio = (previewCanvas && previewCanvas.height > 0)
                ? (previewCanvas.width / previewCanvas.height)
                : (800 / 600);

            switch (document.getElementById("projectionSelect").value) {
                case "persp":

                    // *** TODO_A2 *** Task 1b ***
                    // Using the values above, implement the perspective projection matrix
                    // and replace the standard projection matrix below.
                    
                    // *** begin code, replace the code below    

                    // perspective() in math.js handles the full matrix for us,
                    // it takes fovy in degrees, the canvas aspect ratio, and the near/far clip planes.
                    // what this is doing is mapping the view frustum into clip space, where
                    // things farther away appear smaller (that's the whole point of perspective).
                    return perspective(fovy, aspectRatio, near, far);

                    // *** end code

                case "ortho":

                    // *** TODO_A2 *** Task 1c ***
                    // Using the values above, implement the orthographic projection matrix
                    // and replace the standard projection matrix below.
                    // Derive the values for left, right, top, bottom from dist and fovy.
                    // Keep near/far from the corresponding sliders for depth clipping.

                    // *** begin code, replace the code below       

                    // for orthographic we need to figure out the visible box size.
                    // the idea is to use dist and fovy to get the half-height of the view,
                    // basically asking: at a distance of dist, how tall is our field of view?
                    // then we scale that horizontally using the aspect ratio.
                    // unlike perspective, there's no foreshortening since parallel lines stay parallel.
                    let half_h = dist * Math.tan(radians(fovy / 2));
                    let half_w = half_h * aspectRatio;

                    return ortho(-half_w, half_w, -half_h, half_h, near, far);

                    // *** end code

            }
        }
    };

    let light = {
        modelMatrix: function () {
            let rotx = Number(document.getElementById("lightRotXSlider").value);
            let rotz = Number(document.getElementById("lightRotZSlider").value);
            let dist = Number(document.getElementById("lightDistSlider").value);
            return mult(mult(rotateX(rotx), rotateZ(-rotz)), translate(0, dist, 0, 1));
        },

        color: function () {
            const ci = Number(document.getElementById("lightSlider").value);
            const cv = hexToRgb(document.getElementById("lightColor").value);
            return cv.map(x => ci * x);
        }
    };

    document.getElementById("materialSelect").onchange = function (event) {
        materialManager.setActiveMaterial(event.target.value);
    };
    document.getElementById("qsSlider").oninput = function (event) {
        materialManager.activeMaterial.qs = Number(event.target.value);
        document.getElementById("qsValue").innerHTML = Number(event.target.value).toPrecision(4);
    };
    document.getElementById("kaColor").oninput = function (event) {
        materialManager.setColor("ka", event.target.value);
        const c = hexToRgb(event.target.value);
        document.getElementById("kaR").innerHTML = c[0].toFixed(2);
        document.getElementById("kaG").innerHTML = c[1].toFixed(2);
        document.getElementById("kaB").innerHTML = c[2].toFixed(2);
    };
    document.getElementById("kdColor").oninput = function (event) {
        materialManager.setColor("kd", event.target.value);
        const c = hexToRgb(event.target.value);
        document.getElementById("kdR").innerHTML = c[0].toFixed(2);
        document.getElementById("kdG").innerHTML = c[1].toFixed(2);
        document.getElementById("kdB").innerHTML = c[2].toFixed(2);
    };
    document.getElementById("ksColor").oninput = function (event) {
        materialManager.setColor("ks", event.target.value);
        const c = hexToRgb(event.target.value);
        document.getElementById("ksR").innerHTML = c[0].toFixed(2);
        document.getElementById("ksG").innerHTML = c[1].toFixed(2);
        document.getElementById("ksB").innerHTML = c[2].toFixed(2);
    };

    let materialManager = {
        activeMaterial: undefined,

        materials: {
            "Reddish": {
                colors: { "ka": [0.1, 0.1, 0.1], "kd": [0.8, 0.1, 0.1], "ks": [0.2, 0.2, 0.2] },
                qs: 12,
            },
            "Greenish": {
                colors: { "ka": [0.1, 0.1, 0.1], "kd": [0.1, 0.8, 0.1], "ks": [0.2, 0.2, 0.2] },
                qs: 12,
            },
            "Bluish": {
                colors: { "ka": [0.1, 0.1, 0.1], "kd": [0.1, 0.1, 0.8], "ks": [0.2, 0.2, 0.2] },
                qs: 12,
            },

            // *** TODO_A2 : Task 3
            // Create three new materials and add them to this list using the 'Template Material'.
            // Experiment with the sliders in the GUI and be creative!
            // There is no right or wrong material setting for Phong Model, just try to make it look as good as possible.
            //  - Create a metal-like material, for instance "Polished Copper".
            //  - Create a glossy material, e.g., "Pearl".
            //  - Create a matte material, for instance "Pewter".

            "Template Material": {
                colors: { "ka": [0, 0, 0], "kd": [0, 0, 0], "ks": [0, 0, 0] },
                qs: 0,
            },

            "Titanium": {
                colors: { "ka": [0.12, 0.12, 0.14], "kd": [0.30, 0.30, 0.33], "ks": [0.65, 0.65, 0.70] },
                qs: 76.8,
            },
            "Polished Silver": {
                colors: { "ka": [0.23, 0.23, 0.23], "kd": [0.28, 0.28, 0.28], "ks": [0.77, 0.77, 0.77] },
                qs: 89.6,
            },
            "Marble": {
                colors: { "ka": [0.15, 0.14, 0.13], "kd": [0.82, 0.80, 0.77], "ks": [0.45, 0.45, 0.45] },
                qs: 38.4,
            },
            "Sand": {
                colors: { "ka": [0.10, 0.08, 0.05], "kd": [0.70, 0.58, 0.35], "ks": [0.02, 0.02, 0.01] },
                qs: 2.0,
            },
        },

        setActiveMaterial: function (name) {
            let mat = this.materials[name];
            this.activeMaterial = mat;
            document.getElementById("qsSlider").value = Number(mat.qs);
            document.getElementById("qsValue").innerHTML = Number(mat.qs).toPrecision(4);

            function setGuiColor(component, c) {
                document.getElementById(component.concat("Color")).value = rgbToHex(c);
                document.getElementById(component.concat("R")).innerHTML = c[0].toFixed(2);
                document.getElementById(component.concat("G")).innerHTML = c[1].toFixed(2);
                document.getElementById(component.concat("B")).innerHTML = c[2].toFixed(2);
            }

            setGuiColor("ka", mat.colors["ka"]);
            setGuiColor("kd", mat.colors["kd"]);
            setGuiColor("ks", mat.colors["ks"]);
        },

        setColor: function (component, hexvalue) {
            let mat = this.activeMaterial;
            mat.colors[component] = hexToRgb(hexvalue);
        }
    };

    materialManager.setActiveMaterial("Reddish");

    Object.keys(materialManager.materials).forEach(element => {
        let opt = document.createElement("option");
        opt.value = element;
        opt.text = element;
        opt.className = "uibox";
        document.getElementById("materialSelect").add(opt);
        document.getElementById("obj1MatSelect").add(opt.cloneNode(true));
        document.getElementById("obj2MatSelect").add(opt.cloneNode(true));
        document.getElementById("obj3MatSelect").add(opt.cloneNode(true));
    });

    // Default object-material mapping for the initial scene.
    document.getElementById("obj1MatSelect").value = "Reddish";
    document.getElementById("obj2MatSelect").value = "Greenish";
    document.getElementById("obj3MatSelect").value = "Bluish";

    function render(now) {
        // 1) Update animation clock
        timings.update(now);

        // 2) Recompute camera matrices from current GUI values
        let viewMatrix = camera.viewMatrix();
        let projMatrix = camera.projMatrix();

        // 3) Recompute light transform and light position in view-space
        let lightModelMatrix = light.modelMatrix();
        let lightColor = light.color();
        let lightModelViewMatrix = mult(viewMatrix, lightModelMatrix);
        let lightPosVS = mult(lightModelViewMatrix, [0, 0, 0, 1]).splice(0, 3);

        // 4) Read material/shading/toggle state from GUI
        let shadingMode = Number(document.getElementById("shadingSelect").value);
        let obj1Material = materialManager.materials[document.getElementById("obj1MatSelect").value] || materialManager.activeMaterial;
        let obj2Material = materialManager.materials[document.getElementById("obj2MatSelect").value] || materialManager.activeMaterial;
        let obj3Material = materialManager.materials[document.getElementById("obj3MatSelect").value] || materialManager.activeMaterial;

        const drawObj1Checked = document.getElementById("drawObj1").checked;
        const drawObj2Checked = document.getElementById("drawObj2").checked;
        const drawObj3Checked = document.getElementById("drawObj3").checked;
        const drawBulbChecked = document.getElementById("drawBulb").checked;
        const drawFrameChecked = document.getElementById("drawFrame").checked;
        const drawWireChecked = document.getElementById("drawWire").checked;

        // 5) Push complete scene snapshot to the WebGPU renderer and draw one frame
        syncTask2WebGPUCameraAndRender(webgpuHandle, {
            viewMatrix: viewMatrix,
            projMatrix: projMatrix,
            timings: timings,
            drawObj1Enabled: drawObj1Checked,
            drawObj2Enabled: drawObj2Checked,
            drawObj3Enabled: drawObj3Checked,
            drawBulbEnabled: drawBulbChecked,
            drawFrameEnabled: drawFrameChecked,
            drawWireEnabled: drawWireChecked,
            lightModelMatrix: lightModelMatrix,
            lightColor: lightColor,
            lightPosVS: lightPosVS,
            shadingMode: shadingMode,
            obj1Material: obj1Material,
            obj2Material: obj2Material,
            obj3Material: obj3Material
        });

        // 6) Schedule next animation frame
        window.requestAnimationFrame(render);
    }

    window.requestAnimationFrame(render);
}

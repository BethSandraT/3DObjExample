"use strict";

/**
 * Project2.js
 * 
 * Demonstrates student's ability to create and manipulate objects within WebGL.
 * 
 * teapot.obj by joseolmedo at https://www.cgtrader.com/free-3d-models/interior/kitchen/tea-3ed58137-dcbe-4b49-be93-f81297f28687
 * teacup.obj by anella at https://www.cgtrader.com/free-3d-models/household/kitchenware/handmade-ceramic-cup
 * 
 * @author Elizabeth Tyler
 */

var gl;
var pointLengths = [];
var vertexBufferIds = [];
var normalBufferIds = [];
var shaderProgram;

var cameraRotX = 0.0;
var cameraRotY = 0.0;
var cameraRotZ = 0.0;

var modelMatrixLoc;
var perspMatrixLoc;
var cameraMatrixLoc;

var identity = mat4( 1, 0 ,0 ,0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1);

/**
 * Fetch wrapper shamelessly borrowed from Dr. Wiegand's Week7 objreaderdemo.js
 * 
 * @param {*} objURL URL for the Wavefront OBJ file
 * @returns
 */
async function UglyFetchWrapper(objURL) {
    const fetchResponse = await fetch(objURL);//, {mode:'no-cors'});
    const objFileContents = await fetchResponse.text();
    return objFileContents;
}

/**
 * Simple object parser borrowed from Dr. Wiegand's Week7 objreaderdemo.js
 * 
 * @param {String} objFileContents String containing the contents of the OBJ file
 * @returns Dictionary of vertices, faces, textures, and normals of the OBJ file
 */
function SimpleObjParse(objFileContents) {
    // Split file text int into an array of lines
    const objFileLines = objFileContents.split('\n');
  
    // Store each type of data in its own array
    var vertexList  = new Array(); // The vertices of the 3D object
    var faceList    = new Array(); // See note below (*)
    var textureList = new Array(); // Ignore for now
    var normalList  = new Array(); // The normal vectors associated with faces
    // (*) The faceList is a list of list of triplets of indexes
    //     each index is a triangle.  A list of triangles represents
    //     a particular face.  There's a normal associated with each face.
    //     An object may have many faces.
  
    const vertexRE  = /^[vV] .*/;
    const faceRE    = /^[fF] .*/;
    const textureRE = /^vt .*/;
    const normalRE  = /^vn .*/;
  
    for (let lineIDX=0; lineIDX<objFileLines.length; ++lineIDX) {
        // Trim the line of white space on either side
        const line = objFileLines[lineIDX].trim();
  
        // Check for the matches above
        const vertexMatch = vertexRE.exec(line);
        const faceMatch    = faceRE.exec(line);
        const textureMatch = textureRE.exec(line);
        const normalMatch = normalRE.exec(line);
        
        // If this is a vertext line:  'v 1.000000 1.000000 -1.000000'
        if (vertexMatch != null) {
            const fields = line.split(/\s/); // Split at white space
            vertexList.push( vec4(parseFloat(fields[1]),
                                  parseFloat(fields[2]),
                                  parseFloat(fields[3]),
                                  1.0) );
        }
  
        // If this is a face line: 'f 1/1/1 5/2/1 7/3/1 3/4/1'
        else if (faceMatch != null) {
            const fields = line.split(/\s/); // Split at white space
  
            // Loop through every triplet 'vertexid/textureid/normalid' and add 
            // array of three indexes to faceList -- two of them, if there are four triplets
            var vidxList = new Array();
            for (let faceIDX=1; faceIDX<fields.length; ++faceIDX) {
                var faceVertexIndexStrings = fields[faceIDX].split('/');
                vidxList.push( parseInt(faceVertexIndexStrings[0]) );
            }
  
            // Each face can be a list of multiple triangles.
            for (let vidx=1; vidx<vidxList.length-1; ++vidx) {
              // Subtract 1 from each index to make it zero-referenced
              faceList.push( [vidxList[0]-1, vidxList[vidx]-1, vidxList[vidx+1]-1 ]);
            }
        }
                
        // If this is a texture line:  'vt 0.875000 0.750000'
        else if (textureMatch != null) {
            const fields = line.split(/\s/); // Split at white space
            textureList.push( new Array(parseFloat(fields[1]),
                                        parseFloat(fields[2])) );
        }                
                
        // If this is a vertext line:  'vn -1.0000 0.0000 0.0000'
        else if (normalMatch != null) {
            const fields = line.split(/\s/); // Split at white space
            normalList.push( vec3(parseFloat(fields[1]),
                                  parseFloat(fields[2]),
                                  parseFloat(fields[3])) );
        }                
    }// End master for loop
  
    return ( {"vertices":vertexList, 
              "faces":faceList, 
              "textures":textureList, 
              "normals":normalList});
}

/**
 *  Borrowed from Dr. Wiegand's objreaderdemo.js
 * 
 *   This function takes a dictionary representing a Wavefront file and returns a 
 *   simple list of vertex triangles.  It is intended to be drawn with gl.TRIANGLES.
 * @param {*} objDictionary the Dictionary obtained from reading the Wavefront OBJ file
 * @returns Array of vec4 points representing the object
 */
 function VerySimpleTriangleVertexExtraction(objDictionary) {
    const vertexList = objDictionary.vertices;
    const faceList = objDictionary.faces;
    var points = new Array();
  
    for (let faceIDX=0; faceIDX<faceList.length; ++faceIDX) {
        const triangleList = faceList[faceIDX];
  
        points.push( vertexList[ triangleList[0] ] );
        points.push( vertexList[ triangleList[1] ] );
        points.push( vertexList[ triangleList[2] ] );
    }
  
    return (points);
}


/**
 *  Borrowed from Dr. Wiegand's objreaderdemo.js
 * 
 *   Assumme array of points is arranged so that every three points form a 
 *   triangle.  Then compute the normal to each triangle and create a list of
 *   such normals; one for every vertex.
 * @param {*} points An array of points, where every three points form a triangle
 * @returns Array of vec3 points representing the normals of the object polygons
 */
function EstimateNormalsFromTriangles(points) {
    var normals = new Array();

    for (let triIdx=0; triIdx<points.length; triIdx+=3) {
        // Grab the next three points and assume they form a triangle
        const p0 = vec3( points[triIdx+0][0],
                         points[triIdx+0][1],
                         points[triIdx+0][2] );
        const p1 = vec3( points[triIdx+1][0],
                         points[triIdx+1][1],
                         points[triIdx+1][2] );
        const p2 = vec3( points[triIdx+2][0],
                         points[triIdx+2][1],
                         points[triIdx+2][2] );

        // The nornal to the triangle is:
        //   (p2-p0) cross (p1-p0)
        const u1 = subtract(p2,p0);
        const u2 = subtract(p1,p0);
        var n = cross(u1,u2);

        // Make sure it is a unit vector
        n = normalize(n);

        // For now, let's assume the normal is the
        // same for all three vertices
        normals.push(n);
        normals.push(n);
        normals.push(n);
    }

    return (normals);
}


/**
 *  Borrowed from Dr. Wiegand's objreaderdemo, but largely the same throughout 
 *  the class
 * 
 *  Load data onto the GPU and associate the buffer with that data.  Then
 *  (if a variable name is given), associate the variable with the one in the
 *  shader.  Return the ID for the GPU buffer, in case it is useful later.
 * @param {array}  myData Array containing data to load onto the GPU
 * @param {string} shaderVariableStr Name of the variable used by the shader program
 * @param {number} shaderVariableDim Size of each individual shader variable arrays
 * @param {Object} shaderProgram  The object interface for the shader proram
 * @returns
 */
function LoadDataOnGPU(gl, myData, shaderVariableStr, shaderVariableDim, shaderProgram) {
    // Load the vertex data into the GPU
    var bufferID = gl.createBuffer();                                   // Create space on GPU
    gl.bindBuffer( gl.ARRAY_BUFFER, bufferID );                         // Select that space to much about with
    gl.bufferData( gl.ARRAY_BUFFER, flatten(myData), gl.STATIC_DRAW ); // Load data into space

    // Associate out shader position variables with our data buffer
    if (shaderVariableStr != "") {
        var myVar = gl.getAttribLocation( shaderProgram, shaderVariableStr ); // Get variable position in Shader
        gl.vertexAttribPointer( myVar, shaderVariableDim, gl.FLOAT, false, 0, 0 );     // Point variable to currently bound buffer
        gl.enableVertexAttribArray( myVar );                           // Enable the attribute for use
    }

    return bufferID;
}


/**
 *  Based off of Dr. Wiegand's objreaderdemo.js and persp3d.js
 * 
 *  Setup the vertex and fragment shader programs for WebGL.  This 
 *  allows us to be able to display in color (among other things).
 *  The shaders are a part of the overall graphics pipeline, and 
 *  that component uses a special language called GLSL, which allows
 *  it to be extremely versatile in terms of textures, lighting, etc.,
 *  even though it seems unnecessarily complicated for our simple program.
 * 
 * @param {Object} gl - The WegGL graphic library object
 * @returns The shader program object so that attributes can be attached later
 */
function setupShaders(gl) {
    // Attach the GLSL code to the vertex shader, then compile it
    var vertexShaderCode =  "attribute vec4 vPosition;" +   // in-coming parameter
                            "attribute vec3 vColor;" +      // in-coming parameter
                            "attribute vec3 vNormal;" +
                            "uniform mat4 uModelMatrix;" +  // Homogeneous transformation
                            "uniform mat4 uCameraMatrix;" + // Camera View transformation
                            "uniform mat4 uPerspMatrix;" +  // Perspective transformation
                            "varying vec4 fColor;" +        // Passing color variable
                            "void main() {" +
                            "    fColor = vec4(vNormal, 1.0);" +
                            "    gl_Position = uPerspMatrix * uCameraMatrix * uModelMatrix * vPosition;" +
                            "    if (gl_Position.w <= 0.0) " + 
                            "      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);" +
                            "    else {" + 
                            "      gl_Position.x = gl_Position.x / gl_Position.w;" +
                            "      gl_Position.y = gl_Position.y / gl_Position.w;" +
                            "      gl_Position.z = gl_Position.z / gl_Position.w;" +
                            "      gl_Position.w = 1.0;" +
                            "      }" +
                            "}"
    var vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vertexShaderCode);
    gl.compileShader(vertexShader);
    var compileSuccess = gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS);
    if (!compileSuccess) {
        console.log('Vertex shader failed to compile!');    
        var compilationLog = gl.getShaderInfoLog(vertexShader);
        console.log('Shader compiler log: ' + compilationLog);
    }

    // Attach the GLSL code to the fragment shader, then compile it
    var fragmentShaderCode = "precision mediump float;" +
                            "varying vec4 fColor;" +
                            "void main() {" + 
                            "    gl_FragColor = fColor;" +
                            "}"
    var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fragmentShaderCode);
    gl.compileShader(fragmentShader);  
    compileSuccess = gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS);
    if (!compileSuccess) {
    console.log('Fragment shader failed to compile!');    
    var compilationLog = gl.getShaderInfoLog(fragmentShader);
    console.log('Shader compiler log: ' + compilationLog);
    }

    // Create the shader program, attach both shaders in the pipline,
    // then tell WebGL to use that program
    var shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);
    gl.useProgram(shaderProgram);   
    
    if ( !gl.getProgramParameter( shaderProgram, gl.LINK_STATUS) ) {
    var info = gl.getProgramInfoLog(shaderProgram);
    console.log('Could not compile WebGL program: ' + info);
    }

    modelMatrixLoc  = gl.getUniformLocation( shaderProgram, "uModelMatrix" );
    cameraMatrixLoc = gl.getUniformLocation( shaderProgram, "uCameraMatrix" );
    perspMatrixLoc  = gl.getUniformLocation( shaderProgram, "uPerspMatrix" );


    return shaderProgram;
}


/**
 * This is just a convenient way to have the shape not be perfectly aligned on the 
 * axis.
 * @returns A simple 3D homogeneous transform to shrink and rotate the shape
 */
 function GetModelTransformationMatrix(modelIndex) {
    
    var globalTrMatrix = mat4( 1.0,  0.0,  0.0,  0.0,
                               0.0,  1.0,  0.0,  0.0,
                               0.0,  0.0,  1.0,  0.0,
                               0.0,  0.0,  0.0,  1.0 );

    switch (modelIndex) {
        case 0:
            let thX0 = -Math.PI/8 ;
            let thY0 = 0          ;
            let thZ0 = 0          ;
            let csy0 = Math.cos(thX0);
            let sny0 = Math.sin(thX0);
            let csx0 = Math.cos(thY0);
            let snx0 = Math.sin(thY0);
            let csz0 = Math.cos(thZ0);
            let snz0 = Math.sin(thZ0);
            let scl0 = 0.0225;

            // Some standard rotation matrices
            let sc0 = mat4(scl0,  0.0,  0.0,  0.0,
                            0.0, scl0,  0.0,  0.0,
                            0.0,  0.0, scl0,  0.0,
                            0.0,  0.0,  0.0,  1.0 ); 
            let rz0 = mat4(csz0,-snz0,  0.0,  0.0,
                           snz0, csz0,  0.0,  0.0,
                            0.0,  0.0,  1.0,  0.0,
                            0.0,  0.0,  0.0,  1.0 );             
            let ry0 = mat4(csy0,  0.0, sny0,  0.0,
                            0.0,  1.0,  0.0,  0.0,
                          -sny0,  0.0, csy0,  0.0,
                            0.0,  0.0,  0.0,  1.0 );
            let rx0 = mat4( 1.0,  0.0,  0.0,  0.0,
                            0.0, csx0,-snx0,  0.0,
                            0.0, snx0, csx0,  0.0,
                            0.0,  0.0,  0.0,  1.0 );  
            let tr0 = mat4( 1.0,  0.0,  0.0,  0.3,
                            0.0,  1.0,  0.0, -0.15,
                            0.0,  0.0,  1.0,  0.0,
                            0.0,  0.0,  0.0,  1.0 ); 

            return ( mult(globalTrMatrix,(mult(tr0,mult(rx0,mult(ry0,mult(rz0,sc0)))))) ); 
            break;
        case 1:
            let thX1 = 0          ;
            let thY1 = 0          ;
            let thZ1 = 0          ;
            let csy1 = Math.cos(thX1);
            let sny1 = Math.sin(thX1);
            let csx1 = Math.cos(thY1);
            let snx1 = Math.sin(thY1);
            let csz1 = Math.cos(thZ1);
            let snz1 = Math.sin(thZ1);
            let scl1 = 1.725;

            // Some standard rotation matrices
            let sc1 = mat4(scl1,  0.0,  0.0,  0.0,
                            0.0, scl1,  0.0,  0.0,
                            0.0,  0.0, scl1,  0.0,
                            0.0,  0.0,  0.0,  1.0 ); 
            let rz1 = mat4(csz1,-snz1,  0.0,  0.0,
                           snz1, csz1,  0.0,  0.0,
                            0.0,  0.0,  1.0,  0.0,
                            0.0,  0.0,  0.0,  1.0 );             
            let ry1 = mat4(csy1,  0.0, sny1,  0.0,
                            0.0,  1.0,  0.0,  0.0,
                          -sny1,  0.0, csy1,  0.0,
                            0.0,  0.0,  0.0,  1.0 );
            let rx1 = mat4( 1.0,  0.0,  0.0,  0.0,
                            0.0, csx1,-snx1,  0.0,
                            0.0, snx1, csx1,  0.0,
                            0.0,  0.0,  0.0,  1.0 );  
            let tr1 = mat4( 1.0,  0.0,  0.0, -0.2,
                            0.0,  1.0,  0.0, -0.15,
                            0.0,  0.0,  1.0,  0.0,
                            0.0,  0.0,  0.0,  1.0 ); 

            return ( mult(globalTrMatrix,mult(tr1,mult(rx1,mult(ry1,mult(rz1,sc1))))) );  
            break;
    }

    // return (identity);

    // var csy = Math.cos(Math.PI/8);
    // var sny = Math.sin(Math.PI/8);
    // var csx = Math.cos(-Math.PI/8);
    // var snx = Math.sin(-Math.PI/8);

    // // Some standard rotation matrices
    // var ts = mat4( 2.5,  0.0,  0.0,  0.0,
    //                 0.0,  2.5,  0.0,  0.0,
    //                 0.0,  0.0,  2.5,  0.0,
    //                 0.0,  0.0,  0.0,  1.0 );                 
    // var ry = mat4( csy,   0.0,  sny,   0.0,
    //                 0.0,  1.0,  0.0,  0.0,
    //                 -sny,   0.0,  csy,   0.0,
    //                 0.0,  0.0,  0.0,  1.0 );
    // var rx = mat4( 1.0,  0.0,  0.0,  0.0,
    //                 0.0,  csx,  -snx,   0.0,
    //                 0.0,  snx,   csx,   0.0,
    //                 0.0,  0.0,  0.0,  1.0 );  
 
  return ( mult(rx,mult(ry,ts)) );
}

/**
 *  Based off of Dr. Wiegand's persp3d.js, with the addition of internally
 *  calculating the eye, up, and at vectors.
 * 
 *  Create the matrix to transform the space into the camera view
 *  orientation.  This translates and re-orients so that the camera
 *  is along the outside of a sphere looking at the origin.
 **/
function GetCameraOrientationMatrix() {
    
    // For ease of camera manipulation
    var camRadius = 1.0;

    var snx = Math.sin(Math.PI * cameraRotX);
    var sny = Math.sin(Math.PI * cameraRotY);
    var snz = Math.sin(Math.PI * cameraRotZ);
    var csx = Math.cos(Math.PI * cameraRotX);
    var csy = Math.cos(Math.PI * cameraRotY);
    var csz = Math.cos(Math.PI * cameraRotZ);
    var xRotMatrix = mat3(  1.0,  0.0,  0.0,
                            0.0,  csx, -snx,
                            0.0,  snx,  csx );
    var yRotMatrix = mat3(  csy,  0.0,  sny, 
                            0.0,  1.0,  0.0,
                           -sny,  0.0,  csy );
    var zRotMatrix = mat3(  csz, -snz,  0.0,
                            snz,  csz,  0.0, 
                            0.0,  0.0,  1.0 );

    // Get "at" vector; camera looks down z-axis by default
    var at = vec3(0.0, 0.0, -2.0);
    at = mult(xRotMatrix, mult(yRotMatrix, mult(zRotMatrix, at)));

    // Get "eye" vector
    var eyeX = 0.0;
    var eyeY = 0.0;
    var eyeZ = -1.0;
    var eye = vec3(eyeX, eyeY, eyeZ);

    // Get "up" vector, which points up the y-axis by default
    var up = vec3(0.0, 1.0, 0.0);
    up = mult(xRotMatrix, mult(yRotMatrix, mult(zRotMatrix, up)));

    // Get the normal vector
    var n = subtract(eye, at);
    n = normalize(n);

    // Get the u vector in the view plane\
    up = normalize(up);
    var u = cross(up, n);
    u = normalize(u);

    // Get the v vector in the view plane
    var v = cross(n, u);
    v = normalize(v);

    // Translate camera to origin
    var T = mat4( 1.0, 0.0, 0.0, -eyeX,
                  0.0, 1.0, 0.0, -eyeY,
                  0.0, 0.0, 1.0, -eyeZ,
                  0.0, 0.0, 0.0,   1.0 );

    // Inverse of the coordinate transformation needed
    var A = mat4( u[0], v[0], n[0], 0,
                  u[1], v[1], n[1], 0,
                  u[2], v[2], n[2], 0,
                     0,    0,    0, 1 );   

    A = mult(A, T);

    // Get the actual matrix needed
    var M = inverse(A);
    return (M);

    // return (identity);
}

/**
 * Borrowed from Dr. Wiegand's GetPerspectiveProjectionMatrix() from persp3d.js
 * 
 * Construct the perspective projection matrix using the field-of-view
 * method.  Here I compute the aspect ratio directly from the canvas.
 * 
 * @param {*} fovy Field of view in the y direction of the camera frame
 * @param {*} near The near plane of the frustrum
 * @param {*} far  The far plane of the frustrum
 */
function GetPerspectiveMatrix(fovy, near, far) {
    var canvas = document.getElementById( "gl-canvas" );
    var aspectRatio = canvas.width / canvas.height;
    var fovyRadian = fovy * Math.PI / 180.0;
    var nr = near;
    var fr = far;
    var tp = nr * Math.tan(fovyRadian);
    var rgt = tp * aspectRatio;

    return ( mat4( 
        nr/rgt,  0,             0,                     0,
        0,      nr/tp,          0,                     0,
        0,      0,              -(fr+nr)/(fr-nr),      (-2*fr*nr)/(fr-nr),
        0,      0,              -1,                    0) );  

    // return (identity);
}


/**
 *  Based off of Dr. Wiegand's objreaderdemo.js and persp3d.js
 * 
 *  Draw our polygon as a filled polygon, using fanned triangles 
 *  to do so.
 */
function render() {
    gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    
    // Get camera and perspective matrices, then update the variables in the GPU
    var cameraMatrix = GetCameraOrientationMatrix();
    var perspMatrix = GetPerspectiveMatrix(45, -0.1, 0.9);
    gl.uniformMatrix4fv( cameraMatrixLoc, false, flatten(cameraMatrix));
    gl.uniformMatrix4fv( perspMatrixLoc, false, flatten(perspMatrix)); 
    
    // var modelMatrix = GetModelTransformationMatrix(1);
    // gl.uniformMatrix4fv( modelMatrixLoc, false, flatten(modelMatrix));
    // gl.drawArrays(gl.TRIANGLES, 0, pointLengths[1]);
    
    // For each object,
    for (let modelIndex = 0; modelIndex < vertexBufferIds.length; modelIndex++) {

        // Bind vPosition to the current object's vertex buffer,
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBufferIds[modelIndex]);
        var positionVar = gl.getAttribLocation(shaderProgram, "vPosition");
        gl.vertexAttribPointer(positionVar, 4, gl.FLOAT, false, 0, 0);

        // Bind vNormal to the current object's normal buffer,
        gl.bindBuffer(gl.ARRAY_BUFFER, normalBufferIds[modelIndex]);
        var normalVar = gl.getAttribLocation(shaderProgram, "vNormal");
        gl.vertexAttribPointer(normalVar, 3, gl.FLOAT, false, 0, 0);

        // Adjust the object in model space,
        let modelMatrix = GetModelTransformationMatrix(modelIndex);
        gl.uniformMatrix4fv( modelMatrixLoc, false, flatten(modelMatrix));

        // Then draw the object
        gl.drawArrays( gl.TRIANGLES, 0, pointLengths[modelIndex] );
    }

}

/**
 * Main function largely borrowed from Dr. Wiegand's objreaderdemo
 */
async function main() {
    var canvas = document.getElementById( "gl-canvas" );
    gl = WebGLUtils.setupWebGL( canvas );
    if ( !gl ) { alert( "WebGL isn't available" ); }

    // Configure WebGL by setting the canvas view and the background color
    gl.viewport( 0, 0, canvas.width, canvas.height ); // View whole canvas
    gl.clearColor( 0.9, 0.9, 0.9, 1.0 );              // BG:  Opaque Gray
    gl.enable(gl.DEPTH_TEST);

    // Setup the vertex and fragment shaders (for color)
    shaderProgram = setupShaders(gl);

    document.getElementById("slideRotX").oninput = rotateX;
    document.getElementById("slideRotY").oninput = rotateY;
    document.getElementById("slideRotZ").oninput = rotateZ;
    
    // Hard coding in the object list
    const model1URL = 'https://raw.githubusercontent.com/BethSandraT/PublicObjFiles/main/teacup.obj';
    const model2URL = 'https://raw.githubusercontent.com/BethSandraT/PublicObjFiles/main/teapot.obj';
    const modelURLs = [model1URL, model2URL];


    for (let modelIndex = 0; modelIndex < modelURLs.length; modelIndex++) {
        let objFileContents = await UglyFetchWrapper(modelURLs[modelIndex]);
        let objData = SimpleObjParse(objFileContents);
        let points = VerySimpleTriangleVertexExtraction(objData);  
        let normals = EstimateNormalsFromTriangles(points);  

        vertexBufferIds[modelIndex] = LoadDataOnGPU(gl, points.flat(), "vPosition", 4, shaderProgram);
        normalBufferIds[modelIndex] = LoadDataOnGPU(gl, normals.flat(), "vNormal", 3, shaderProgram);
        pointLengths[modelIndex] = points.length;
    }

    render();
};

window.onload = function init() {
    main();
}

function rotateX() {
    cameraRotX = parseFloat(document.getElementById("slideRotX").value);
    render();
}

function rotateY() {
    cameraRotY = parseFloat(document.getElementById("slideRotY").value);
    render();
}

function rotateZ() {
    cameraRotZ = parseFloat(document.getElementById("slideRotZ").value);
    render();
}
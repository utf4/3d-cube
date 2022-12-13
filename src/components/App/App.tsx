import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import TWEEN from '@tweenjs/tween.js';

import { StyledApp } from './App.styles';
import ControlBoard from '../ControlBoard/ControlBoard';
import ViewCube, { Orientation } from '../ViewCube/ViewCube';

const teapotPath = require('../../assets/meshes/teapot.stl');
const Stats = require('stats.js');

export type TOOL = 'pick' | '';

const MESH_RGB = [233, 30, 99];

function App() {
  const statsRef = useRef<any>(null);

  const observed = useRef<HTMLDivElement>(null);
  const objectRef = useRef<THREE.Object3D | null>(null);
  const helperRef = useRef<THREE.Mesh | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<
    THREE.PerspectiveCamera | THREE.OrthographicCamera | null
  >(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const callbackRef = useRef<Function>(() => console.log('hi'));
  const controlsRef = useRef<OrbitControls | null>(null);
  const raycasterRef = useRef<THREE.Raycaster | null>(null);

  const [rotating, toggleRotating] = useState(false);
  const [currentTool, selectCurrentTool] = useState<TOOL>('');
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const addMeshToScene = (
    geometry: THREE.BufferGeometry,
    scene: THREE.Scene
  ) => {
    const containerObj = new THREE.Object3D();
    const material = new THREE.MeshPhongMaterial({
      // vertexColors: true,
    });
    scene.add(containerObj);

    const mesh = new THREE.Mesh(geometry, material);
    containerObj.add(mesh);
    containerObj.scale.multiplyScalar(2);

    objectRef.current = containerObj as THREE.Object3D;

    const box = new THREE.Box3().expandByObject(containerObj);

    cameraRef.current!.zoom =
      Math.min(
        window.innerWidth / (box.max.x - box.min.x),
        window.innerHeight / (box.max.y - box.min.y)
      ) * 0.4;
    cameraRef.current!.updateProjectionMatrix();
  };

  const addTriangleHelperToScene = (scene: THREE.Scene) => {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
    });

    const vertices = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3)
    );
    (geometry.attributes.position as any).setUsage(THREE.DynamicDrawUsage);
    const helper = new THREE.Mesh(geometry, material);

    helperRef.current = helper as THREE.Mesh;

    scene.add(helper);
  };

  const onMouseMove = (event: MouseEvent) => {
    setMousePos({
      x: (event.clientX / window.innerWidth) * 2 - 1,
      y: -(event.clientY / window.innerHeight) * 2 + 1,
    });
  };

  useEffect(() => {
    const appElement = observed.current;

    if (appElement) {
      // stats setup
      const stats = new Stats();
      document.body.appendChild(stats.dom);

      // init renderer
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
      });
      const bgColor = 0x263238 / 2;
      renderer.setClearColor(bgColor, 1);
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(window.devicePixelRatio || 1);

      // init raycaster
      const raycaster = new THREE.Raycaster();

      // init scene
      const scene = new THREE.Scene();
      const ambientLight = new THREE.AmbientLight(0x736f6e, 1.25);
      scene.add(ambientLight);

      let camera = new THREE.OrthographicCamera(
        -window.innerWidth / 2,
        window.innerWidth / 2,
        window.innerHeight / 2,
        -window.innerHeight / 2
      );

      camera.position.x = 20;
      camera.position.y = -20;
      camera.position.z = 20;
      camera.up = new THREE.Vector3(0, 0, 1);
      camera.updateProjectionMatrix();

      const pointLight = new THREE.PointLight(0xffffff, 0.25);
      camera.add(pointLight);

      scene.add(camera);

      // init controls and raycaster stuff
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enablePan = false;
      // controls.enableKeys = false;

      // init geometry
      const loader = new STLLoader();
      loader.load(teapotPath, (geometry) => {
        if (!geometry) {
          throw new Error('Unable to load geometry');
        }
        geometry.computeVertexNormals();
        geometry.center();

        // setup color attributes on faces
        const colorAttr = new THREE.BufferAttribute(
          new Float32Array(geometry.attributes.position.count * 3),
          3
        );
        const colorAttrLen = colorAttr.count / 3;

        // color the faces
        const rFloat = MESH_RGB[0] / 255;
        const gFloat = MESH_RGB[1] / 255;
        const bFloat = MESH_RGB[2] / 255;
        for (let i = 0; i < colorAttrLen; i++) {
          colorAttr.setXYZ(i * 3 + 0, rFloat, gFloat, bFloat);
          colorAttr.setXYZ(i * 3 + 1, rFloat, gFloat, bFloat);
          colorAttr.setXYZ(i * 3 + 2, rFloat, gFloat, bFloat);
        }

        geometry.setAttribute('color', colorAttr);
        (geometry.attributes.color as any).setUsage(THREE.DynamicDrawUsage);

        addMeshToScene(geometry, scene);

        addTriangleHelperToScene(scene);
        console.log('Geometry Loaded', geometry);
      });

      function epsilon(value: number) {
        return Math.abs(value) < 1e-10 ? 0 : value;
      }

      function getCameraCSSMatrix(matrix: THREE.Matrix4) {
        const { elements } = matrix;

        return `matrix3d(
          ${epsilon(elements[0])},
          ${epsilon(-elements[1])},
          ${epsilon(elements[2])},
          ${epsilon(elements[3])},
          ${epsilon(elements[4])},
          ${epsilon(-elements[5])},
          ${epsilon(elements[6])},
          ${epsilon(elements[7])},
          ${epsilon(elements[8])},
          ${epsilon(-elements[9])},
          ${epsilon(elements[10])},
          ${epsilon(elements[11])},
          ${epsilon(elements[12])},
          ${epsilon(-elements[13])},
          ${epsilon(elements[14])},
          ${epsilon(elements[15])})`;
      }

      let cube;
      const mat = new THREE.Matrix4();

      // setup render loop
      function animate(): void {
        cube = document.querySelector('.cube') as HTMLDivElement;

        if (cube && cameraRef.current) {
          mat.extractRotation(cameraRef.current.matrixWorldInverse);
          cube.style.transform = `translateZ(-300px) ${getCameraCSSMatrix(
            mat
          )}`;
        }

        TWEEN.update();

        stats.begin();
        renderer.render(scene, camera);
        stats.end();
        requestAnimationFrame(animate);
        controls.update();
        callbackRef.current();
      }

      // resize handler
      const onResize = () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.left = -window.innerWidth / 2;
        camera.right = window.innerWidth / 2;
        camera.top = window.innerHeight / 2;
        camera.bottom = -window.innerHeight / 2;
        camera.updateProjectionMatrix();
      };
      window.addEventListener('resize', onResize);

      // attach rendering canvas to DOM
      appElement.appendChild(renderer.domElement);

      // define default render callback
      callbackRef.current = () => {};

      // trigger animation
      animate();

      statsRef.current = stats;
      sceneRef.current = scene;
      cameraRef.current = camera;
      rendererRef.current = renderer;
      controlsRef.current = controls;
      raycasterRef.current = raycaster;

      // setup mouse event handlers
      window.addEventListener('mousemove', onMouseMove);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, [observed]);

  useEffect(() => {
    const vertA = new THREE.Vector3();
    const vertB = new THREE.Vector3();
    const vertC = new THREE.Vector3();
    if (currentTool === 'pick') {
      if (
        raycasterRef.current &&
        cameraRef.current &&
        objectRef.current &&
        helperRef.current
      ) {
        raycasterRef.current.setFromCamera(mousePos, cameraRef.current);
        const intersections = raycasterRef.current.intersectObject(
          objectRef.current,
          true
        );

        if (intersections.length > 0) {
          // show helper if got intersection
          if (!helperRef.current.visible) helperRef.current.visible = true;

          // get the intersected face index
          const intersection = intersections[0];

          const mesh = intersection.object as THREE.Mesh;
          const faceIndex = intersection.faceIndex as number;

          const positionAttr = (mesh.geometry as THREE.BufferGeometry)
            .attributes.position as THREE.BufferAttribute;

          vertA
            .fromBufferAttribute(positionAttr, faceIndex * 3 + 0)
            .applyMatrix4(mesh.matrixWorld);
          vertB
            .fromBufferAttribute(positionAttr, faceIndex * 3 + 1)
            .applyMatrix4(mesh.matrixWorld);
          vertC
            .fromBufferAttribute(positionAttr, faceIndex * 3 + 2)
            .applyMatrix4(mesh.matrixWorld);

          // transform helper geometry to copy intersecting triangle's position and shape
          helperRef.current.geometry.setFromPoints([vertA, vertB, vertC]);
          const helperPositionAttr = (helperRef.current
            .geometry as THREE.BufferGeometry).attributes
            .position as THREE.BufferAttribute;
          helperPositionAttr.needsUpdate = true;
        } else {
          // hide helper if no intersection
          if (helperRef.current.visible) helperRef.current.visible = false;
        }
      }
    }
  }, [mousePos, currentTool]);

  const tweenCamera = (orientation: Orientation) => {
    const { offsetFactor, axisAngle } = orientation;

    if (cameraRef.current && objectRef.current) {
      const offsetUnit = cameraRef.current.position.length();
      const offset = new THREE.Vector3(
        offsetUnit * offsetFactor.x,
        offsetUnit * offsetFactor.y,
        offsetUnit * offsetFactor.z
      );

      const center = new THREE.Vector3();
      const finishPosition = center.add(offset);

      const positionTween = new TWEEN.Tween(cameraRef.current.position)
        .to(finishPosition, 300)
        .easing(TWEEN.Easing.Circular.Out);

      const euler = new THREE.Euler(axisAngle.x, axisAngle.y, axisAngle.z);

      // rotate camera too!
      const finishQuaternion = new THREE.Quaternion()
        .copy(cameraRef.current.quaternion)
        .setFromEuler(euler);

      const quaternionTween = new TWEEN.Tween(cameraRef.current.quaternion)
        .to(finishQuaternion, 300)
        .easing(TWEEN.Easing.Circular.Out);

      positionTween.start();
      quaternionTween.start();
    }
  };

  useEffect(() => {
    if (rotating) {
      // start rotating object
      callbackRef.current = () => {
        if (objectRef.current) {
          objectRef.current.rotation.x += 0.01;
          objectRef.current.rotation.y += 0.01;
        }
      };
    } else {
      // stop rotating object
      callbackRef.current = () => {};
    }
  }, [rotating]);

  return (
    <StyledApp ref={observed}>
      {/* <GithubLink /> */}
      <ViewCube tweenCamera={(orientation) => tweenCamera(orientation)} />
      {/* <ControlBoard
        rotating={rotating}
        currentTool={currentTool}
        toggleRotation={() => toggleRotating(!rotating)}
        selectCurrentTool={tool => selectCurrentTool(tool)}
      /> */}
    </StyledApp>
  );
}

export default App;

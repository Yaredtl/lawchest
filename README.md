# LawChest

Programa de escritorio para Windows que organiza los **clientes**, sus **archivos** y sus **gastos e ingresos**. Está pensado para un despacho de abogados y su diseño recuerda a Google Drive.

- No necesita servidor: los datos se guardan en el ordenador o en tu propia nube (OneDrive, Google Drive o Dropbox) si lo usas en varios ordenadores.
- Se instala con un único archivo `LawChest-Setup.exe`, como cualquier otro programa.
- Colores del despacho: granate `#6A1F2B` y ámbar `#F8A11B`. Fuentes: *Oranienbaum* para los títulos e *Inter* para los textos. Ambas van incluidas, así que no hace falta conexión.

## Funciones

| | |
|---|---|
| **Clientes** | Carpeta principal con todos los clientes. El nombre es libre y se pueden añadir datos opcionales (DNI, teléfono, email, dirección, nº de expediente… o cualquier dato propio). Buscador y vista en cuadrícula o lista. |
| **Zona de trabajo** | Cada cliente tiene su carpeta. Se le añaden archivos de cualquier tipo **arrastrándolos**, con **«Subir archivos»** o **pegándolos (Ctrl+V)**, incluidas capturas de pantalla. Admite subcarpetas ilimitadas, mover, renombrar y abrir en el Explorador. |
| **Gastos e ingresos** | Tabla con concepto, importe, tipo y fecha opcional. El **balance** (ingresos − gastos) está siempre visible. |
| **Resúmenes** | Por cliente, o mensual con todos los clientes (totales y detalle de movimientos). Se descargan en **PDF, Excel o CSV**. |
| **Papelera** | Lo borrado (clientes, carpetas y archivos) se guarda **30 días** y después se elimina solo. Se puede restaurar o vaciar cuando se quiera. |
| **Confirmaciones** | Solo se pide confirmación antes de borrar datos (o sustituirlos al restaurar una copia). |
| **Copias de seguridad** | Un botón guarda todo en un `.zip`, por ejemplo en un USB, y otro lo restaura. |
| **Varios ordenadores** | Sincronización con **Google Drive por internet** (recomendado, sin instalar nada) o mediante la carpeta de OneDrive, Dropbox o Google Drive para ordenador. |
| **Actualizaciones** | Al abrir LawChest se avisa si hay una versión nueva, que se instala con un clic. |

## Dónde se guardan los datos

Por defecto, los datos van en `Documentos\LawChest\`, separados del programa, de modo que desinstalarlo o actualizarlo no los borra:

```
LawChest\
├── Clientes\                        ← una carpeta por cliente (con sus subcarpetas)
├── Papelera\                        ← lo borrado (se vacía solo a los 30 días)
├── lawchest.db                      ← base de datos (clientes, datos y cuentas)
└── Conflictos de sincronización\    ← solo si se editó a la vez en dos ordenadores
```

### Usar LawChest en varios ordenadores con Google Drive (por internet, recomendado)

1. En **Ajustes → Usar LawChest en varios ordenadores** (o en la bienvenida), pulsa **Google Drive (por internet)**. Se abre el navegador: inicia sesión con tu cuenta de Google y pulsa **Continuar**.
2. En el otro ordenador, instala LawChest y haz lo mismo con la misma cuenta: se descarga todo.

Cómo funciona:
- Los datos siguen en el ordenador (`Documentos\LawChest`), así que LawChest funciona sin internet. Además se sincronizan con la carpeta **LawChest** de tu Google Drive, donde los archivos se pueden abrir desde drive.google.com.
- Se sincroniza al abrir, tras cada cambio, al volver a la ventana, cada 3 minutos y al cerrar. Solo se transfiere lo nuevo o modificado, y los movimientos y renombrados no vuelven a subir el archivo.
- Lo que se borra en un ordenador va a la papelera de Windows del otro (y a la de Google Drive). Si el mismo archivo se modifica en los dos, se conservan ambas versiones: «… (conflicto EQUIPO fecha)».
- También se reciben los archivos que subas desde la web de Google Drive a la carpeta de un cliente.
- El permiso de Google se guarda cifrado con tu usuario de Windows.
- Mientras la app de Google Cloud esté «en prueba», Google pide renovar el permiso **cada 7 días**. LawChest avisa con antelación y, cuando toca, muestra «Vuelve a conectar Google Drive»: un botón y «Continuar» en el navegador. No se pierde nada mientras tanto.

Para compilar con Google Drive hacen falta los *secrets* de GitHub `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`, que corresponden a un cliente OAuth de tipo «App de escritorio» con la API de Google Drive activada.

### Alternativa: carpeta de OneDrive, Dropbox o Google Drive para ordenador

1. En el primer ordenador, ve a **Ajustes → Dónde se guardan tus datos** y elige **OneDrive**, **Google Drive** o **Dropbox**. Los datos se copian a `<tu nube>\LawChest`. Si no se detecta tu nube, su botón te deja elegir la carpeta a mano. En Google Drive es «Mi unidad», que normalmente está en la unidad G:.
2. En el segundo ordenador, inicia sesión en la misma nube, instala LawChest y, en la pantalla de bienvenida, elige esa nube. Aparecerá marcada como **«Datos encontrados»**.

Cómo funciona:
- Los archivos de los clientes los sincroniza directamente la nube.
- La base de datos nunca se abre dentro de la carpeta sincronizada, porque así se corrompe. Cada ordenador trabaja con una copia local en AppData.
- Tras cada cambio, LawChest guarda en `lawchest.db` una versión completa y la sustituye de golpe.
- Al abrir la app, al volver a la ventana y cada 15 segundos, LawChest comprueba si el otro ordenador ha guardado algo nuevo y, si es así, lo carga.
- Si se hacen cambios a la vez en los dos ordenadores, se queda la versión más reciente y la otra se guarda en `Conflictos de sincronización`.

## Desinstalar

- **Desde LawChest:** en **Ajustes → Desinstalar LawChest**. Se puede marcar «Borrar también todos mis datos». Si están en OneDrive, Google Drive o Dropbox, se avisa de que también desaparecerán de los otros ordenadores.
- **Desde Windows:** en **Configuración → Aplicaciones → LawChest → Desinstalar**. Al final se pregunta si borrar también los datos de `Documentos\LawChest` (por defecto, no). Los datos de la nube no se tocan desde aquí.

En ambos casos se elimina el programa, sus accesos directos, los ajustes y la copia de trabajo (`%APPDATA%\LawChest`) y la caché de actualizaciones. Las actualizaciones automáticas nunca borran nada.

## Actualizaciones automáticas

Al abrir LawChest, y cada 6 horas, el programa consulta las versiones publicadas en GitHub (Releases). Si hay una nueva, muestra un aviso con **«Actualizar ahora»**: la descarga, se cierra, se instala y vuelve a abrirse. Los datos no se tocan.

> **Requisito:** para que LawChest pueda consultar las versiones sin contraseña, las Releases deben ser públicas. Es decir, el repositorio tiene que ser público, o los instaladores deben publicarse en otro repositorio público. En el código no hay datos de clientes: esos datos solo están en cada ordenador y en su nube.

## Descargar el instalador

Cada vez que se suben cambios a GitHub, la acción **«Instalador de Windows»** genera el instalador:

1. Entra en la pestaña **Actions** del repositorio y abre la última ejecución en verde.
2. Al final de la página, en **Artifacts**, descarga **LawChest-Instalador-Windows**. Es un `.zip` que contiene `LawChest-Setup-x.y.z.exe`.
3. Ejecuta el `.exe` en el ordenador. Windows puede mostrar el aviso «Windows protegió su PC», porque el programa no está firmado digitalmente: pulsa **Más información → Ejecutar de todas formas**.

Cada vez que se actualiza la rama `main`, el instalador también se publica en **Releases** con la versión de `package.json` (por ejemplo, `v1.0.0`). Para sacar una versión nueva, sube el número de `version` en `package.json`.

## Desarrollo

Requisitos: Node.js 22 o superior.

```bash
npm install
npm run dev        # abre la app en modo desarrollo
npm run typecheck  # comprueba los tipos
npm run dist:win   # genera el instalador (en Windows)
```

Tecnologías: Electron, React, TypeScript, Tailwind CSS, SQLite (incluido en Electron, sin módulos nativos), pdfmake, ExcelJS, electron-builder (NSIS) y electron-updater.

Seguridad: aislamiento de contexto, *sandbox*, sin integración de Node en la interfaz, política de contenidos estricta y validación de rutas para no salir de la carpeta del cliente. La app solo se conecta a Google (si conectas Google Drive) y a GitHub (para buscar actualizaciones).

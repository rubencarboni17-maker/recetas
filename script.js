document.addEventListener('DOMContentLoaded', () => {
    const bgSelect = document.getElementById('bgSelect');
    const recipeSheet = document.getElementById('recipeSheet');
    const dropZone = document.getElementById('dropZone');
    const btnPdf = document.getElementById('btnPdf');
    const btnClearSheet = document.getElementById('btnClearSheet');
    const textColor = document.getElementById('textColor');
    const fontSizeSelect = document.getElementById('fontSizeSelect');
    const pdfUpload = document.getElementById('pdfUpload');

    // Fondo inicial automático
    if (bgSelect.value) {
        recipeSheet.style.backgroundImage = `url('${bgSelect.value}')`;
        recipeSheet.style.backgroundSize = 'cover';
        recipeSheet.style.backgroundPosition = 'center';
    }

    // Cambiar fondo desde el menú desplegable
    bgSelect.addEventListener('change', (e) => {
        const selectedBg = e.target.value;
        if (selectedBg) {
            recipeSheet.style.backgroundImage = `url('${selectedBg}')`;
            recipeSheet.style.backgroundSize = 'cover';
            recipeSheet.style.backgroundPosition = 'center';
        } else {
            recipeSheet.style.backgroundImage = 'none';
        }
    });

    // Botón para limpiar pantalla manteniendo el fondo
    btnClearSheet.addEventListener('click', () => {
        if (confirm('¿Deseas limpiar todo el texto de la pantalla?')) {
            dropZone.innerHTML = '<div class="placeholder-msg">Importa tu PDF o haz clic en los elementos para armar tu receta...</div>';
        }
    });

    // Importación de PDF con separación inteligente y robusta
    pdfUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.readAsArrayBuffer(file);
        reader.onload = async function () {
            const typedarray = new Uint8Array(this.result);
            try {
                const pdf = await pdfjsLib.getDocument(typedarray).promise;
                let fullText = "";

                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(" ");
                    fullText += pageText + "\n";
                }

                // Limpiamos la zona de trabajo
                dropZone.innerHTML = '';

                // Creamos los bloques con separación precisa
                renderPerfectBlocks(fullText);

            } catch (error) {
                console.error("Error al leer el PDF:", error);
                alert("No se pudo leer el archivo PDF.");
            }
        };
    });

    function renderPerfectBlocks(rawText) {
        // Limpiamos caracteres extraños del PDF
        let cleanText = rawText.replace(/[\u25A0-\u25FF\uFFFD]/g, '• ').trim();

        // 1. Detección del Título (Todo lo que está antes de la palabra "Ingredientes")
        let titleText = "Receta Importada";
        let bodyText = cleanText;

        const ingIndex = cleanText.search(/ingredientes/i);
        if (ingIndex !== -1) {
            titleText = cleanText.substring(0, ingIndex).trim();
            bodyText = cleanText.substring(ingIndex).replace(/ingredientes\s*[:\-]*/i, '').trim();
        }

        if (!titleText || titleText.length < 3) {
            titleText = "Wrap de huevo y queso feta";
        }

        // 2. Separación entre Ingredientes y Preparación / Elaboración
        let ingredientsPart = bodyText;
        let preparationPart = "";

        // Buscamos cualquier variante de preparación o elaboración
        const prepRegex = /(preparaci[oó]n|elaboraci[oó]n|pasos)\s*[:\-]*/i;
        const prepMatch = bodyText.search(prepRegex);

        if (prepMatch !== -1) {
            ingredientsPart = bodyText.substring(0, prepMatch).trim();
            preparationPart = bodyText.substring(prepMatch).replace(prepRegex, '').trim();
        } else {
            // Si el PDF no tiene la palabra clave escrita, dividimos el texto a la mitad por lógica
            let words = bodyText.split(' ');
            let midPoint = Math.floor(words.length / 2);
            ingredientsPart = words.slice(0, midPoint).join(' ');
            preparationPart = words.slice(midPoint).join(' ');
        }

        // --- RENDERIZAR BLOQUE TÍTULO ---
        const titleBlock = createBlock('title');
        titleBlock.style.top = '30px';
        titleBlock.style.left = '40px';
        titleBlock.style.width = '650px';
        titleBlock.querySelector('[contenteditable]').innerText = titleText;
        dropZone.appendChild(titleBlock);

        // --- RENDERIZAR BLOQUE INGREDIENTES ---
        const ingBlock = createBlock('ingredients');
        ingBlock.style.top = '130px';
        ingBlock.style.left = '40px';
        ingBlock.style.width = '350px';
        ingBlock.style.height = '420px';

        // Convertimos los ingredientes en una lista limpia
        let ingItems = ingredientsPart.split(/•|\d+\s*gr|\d+\s*huevos|\d+\s*cucharadas?|\d+\s*pizcas?/i).filter(i => i.trim().length > 2);
        if (ingItems.length <= 1) {
            ingItems = ingredientsPart.split(',').filter(i => i.trim().length > 0);
        }

        ingBlock.querySelector('.block-text').innerHTML = `
            <ul>
                ${ingItems.map(item => `<li>${item.trim().replace(/^[•\-\s]+/, '')}</li>`).join('')}
            </ul>
        `;
        dropZone.appendChild(ingBlock);

        // --- RENDERIZAR BLOQUE PREPARACIÓN ---
        const prepBlock = createBlock('preparation');
        prepBlock.style.top = '130px';
        prepBlock.style.left = '410px';
        prepBlock.style.width = '410px';
        prepBlock.style.height = '420px';

        // Convertimos la preparación en pasos ordenados divididos por puntos
        let prepSteps = preparationPart.split(/\.\s+/).filter(s => s.trim().length > 0);
        if (prepSteps.length === 0) {
            prepSteps = [preparationPart];
        }

        prepBlock.querySelector('.block-text').innerHTML = `
            <ol>
                ${prepSteps.map(step => `<li>${step.trim()}${step.endsWith('.') ? '' : '.'}</li>`).join('')}
            </ol>
        `;
        dropZone.appendChild(prepBlock);
    }

    function addBlockToSheet(type) {
        const placeholder = dropZone.querySelector('.placeholder-msg');
        if (placeholder) {
            placeholder.remove();
        }
        const block = createBlock(type);
        dropZone.appendChild(block);
    }

    const dragItems = document.querySelectorAll('.drag-item');
    dragItems.forEach(item => {
        item.addEventListener('click', () => {
            const type = item.getAttribute('data-type');
            addBlockToSheet(type);
        });
    });

    function createBlock(type) {
        const wrapper = document.createElement('div');
        wrapper.className = 'recipe-block';

        let isDragging = false;
        let startX, startY;

        // Arrastre fluido (permite seleccionar texto con el mouse con total normalidad)
        wrapper.addEventListener('mousedown', (e) => {
            if (e.target.closest('[contenteditable="true"]')) return;
            isDragging = true;
            startX = e.clientX - wrapper.offsetLeft;
            startY = e.clientY - wrapper.offsetTop;
            wrapper.style.zIndex = 1000;
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            let newX = e.clientX - startX;
            let newY = e.clientY - startY;
            wrapper.style.left = `${newX}px`;
            wrapper.style.top = `${newY}px`;
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            wrapper.style.zIndex = 1;
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.onclick = () => wrapper.remove();
        wrapper.appendChild(deleteBtn);

        const content = document.createElement('div');
        content.setAttribute('contenteditable', 'true');
        content.style.userSelect = 'text';
        content.style.webkitUserSelect = 'text';

        switch (type) {
            case 'title':
                content.className = 'block-title';
                content.innerText = 'Título de la Receta';
                break;
            case 'time':
                content.className = 'block-meta';
                content.innerText = '⏱️ Tiempo: 45 min';
                break;
            case 'complexity':
                content.className = 'block-meta';
                content.innerText = '⭐ Complejidad: Media';
                break;
            case 'portions':
                content.className = 'block-meta';
                content.innerText = '🍽️ Porciones: 4';
                break;
            case 'ingredients':
                const ingTitle = document.createElement('div');
                ingTitle.className = 'block-section-title';
                ingTitle.setAttribute('contenteditable', 'true');
                ingTitle.innerText = 'Ingredientes';
                wrapper.appendChild(ingTitle);

                content.className = 'block-text';
                content.innerHTML = '<ul><li>Ingrediente 1</li></ul>';
                break;
            case 'preparation':
                const prepTitle = document.createElement('div');
                prepTitle.className = 'block-section-title';
                prepTitle.setAttribute('contenteditable', 'true');
                prepTitle.innerText = 'Preparación';
                wrapper.appendChild(prepTitle);

                content.className = 'block-text';
                content.innerHTML = '<ol><li>Paso 1</li></ol>';
                break;
            default:
                content.className = 'block-text';
                content.innerText = 'Escribe tu texto aquí...';
                break;
        }

        wrapper.appendChild(content);
        return wrapper;
    }

    document.querySelectorAll('.tools-row button[data-command]').forEach(button => {
        button.addEventListener('click', () => {
            const command = button.getAttribute('data-command');
            document.execCommand(command, false, null);
        });
    });

    textColor.addEventListener('input', (e) => {
        document.execCommand('foreColor', false, e.target.value);
    });

    fontSizeSelect.addEventListener('change', (e) => {
        document.execCommand('fontSize', false, e.target.value);
    });

    btnPdf.addEventListener('click', () => {
        window.print();
    });
});

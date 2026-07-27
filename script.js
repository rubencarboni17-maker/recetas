document.addEventListener('DOMContentLoaded', () => {
    const bgSelect = document.getElementById('bgSelect');
    const recipeSheet = document.getElementById('recipeSheet');
    const dropZone = document.getElementById('dropZone');
    const btnPdf = document.getElementById('btnPdf');
    const textColor = document.getElementById('textColor');
    const fontSizeSelect = document.getElementById('fontSizeSelect');
    const pdfUpload = document.getElementById('pdfUpload');

    if (bgSelect.value) {
        recipeSheet.style.backgroundImage = `url('${bgSelect.value}')`;
    }

    bgSelect.addEventListener('change', (e) => {
        const selectedBg = e.target.value;
        if (selectedBg) {
            recipeSheet.style.backgroundImage = `url('${selectedBg}')`;
        } else {
            recipeSheet.style.backgroundImage = 'none';
        }
    });

    // Lógica para leer el PDF y separar inteligentemente ingredientes de preparación
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

                dropZone.innerHTML = '';
                parseAndRenderStructuredRecipe(fullText);

            } catch (error) {
                console.error("Error al leer el PDF:", error);
                alert("No se pudo leer el archivo PDF.");
            }
        };
    });

    function parseAndRenderStructuredRecipe(text) {
        let cleanText = text.replace(/[\u25A0-\u25FF\uFFFD\u2610\u2611\u2612]/g, '').trim();

        // 1. Intentar separar ingredientes y preparación buscando palabras clave comunes
        let prepSplitter = /(Elaboraci[oó]n|Preparaci[oó]n|Instrucciones|Pasos):?/i;
        let parts = cleanText.split(prepSplitter);

        let ingredientsRaw = parts[0] || "";
        let preparationRaw = parts.length > 2 ? parts[2] : (parts[1] || "");

        // Crear Bloque de Título / Encabezado limpio
        const titleBlock = createBlock('title');
        titleBlock.querySelector('[contenteditable]').innerText = "Receta Importada";
        dropZone.appendChild(titleBlock);

        // Crear Bloque de Ingredientes
        const ingBlock = createBlock('ingredients');
        const ingContent = ingBlock.querySelector('.block-text');
        
        // Limpiar y estructurar ingredientes de forma genérica
        let ingLines = ingredientsRaw.split(/(?=\d+\s*(?:gr|g|kg|ml|l|cucharada|pizca|huevos|tortilla|hojas|chorrito))/gi);
        let ingHtml = '<ul>';
        if (ingLines.length > 1) {
            ingLines.forEach(l => {
                let cleaned = l.replace(/Ingredientes\s*:?/gi, '').trim();
                if (cleaned.length > 3) ingHtml += `<li>${cleaned}</li>`;
            });
        } else {
            ingHtml += `<li>${ingredientsRaw.replace(/Ingredientes\s*:?/gi, '').trim()}</li>`;
        }
        ingHtml += '</ul>';
        ingContent.innerHTML = ingHtml;
        dropZone.appendChild(ingBlock);

        // Crear Bloque de Preparación
        if (preparationRaw.trim().length > 0) {
            const prepBlock = createBlock('preparation');
            const prepContent = prepBlock.querySelector('.block-text');
            prepContent.innerHTML = `<p>${preparationRaw.trim()}</p>`;
            dropZone.appendChild(prepBlock);
        }
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

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.onclick = () => wrapper.remove();
        wrapper.appendChild(deleteBtn);

        const content = document.createElement('div');
        content.setAttribute('contenteditable', 'true');

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
                content.innerHTML = '<ul><li>100 gr de queso feta</li><li>6 huevos</li><li>1 cucharada de aceite de oliva</li></ul>';
                break;
            case 'preparation':
                const prepTitle = document.createElement('div');
                prepTitle.className = 'block-section-title';
                prepTitle.setAttribute('contenteditable', 'true');
                prepTitle.innerText = 'Preparación';
                wrapper.appendChild(prepTitle);

                content.className = 'block-text';
                content.innerHTML = '<ol><li>Paso número uno...</li><li>Paso número dos...</li></ol>';
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

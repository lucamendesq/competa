// XHR em vez de fetch: só ele reporta o progresso do corpo enviado. A falha de rede vira o
// mesmo `TypeError('Failed to fetch')` do fetch, que é o que `failureKind` lê como offline.
export const putFileToStorage = (
  uploadUrl: string,
  file: File,
  checksumSha256: string,
  onProgress?: (loadedBytes: number) => void,
) =>
  new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('x-amz-checksum-sha256', checksumSha256);
    xhr.upload.onprogress = (event) => onProgress?.(event.loaded);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve(xhr.responseText)
        : reject(new Error(`PUT falhou com ${xhr.status}`));
    xhr.onerror = () => reject(new TypeError('Failed to fetch'));
    xhr.send(file);
  });

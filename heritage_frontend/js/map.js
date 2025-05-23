import { getPoints } from './api.js';

window.initMap = async function () {
    const map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 45.9432, lng: 24.9668 },
        zoom: 7,
    });

    const points = await getPoints();

    points.forEach((point) => {
        const marker = new google.maps.Marker({
            position: { lat: point.latitude, lng: point.longitude },
            map,
            title: point.title,
        });

        const content = `
            <div class="popup">
                <h3>${point.title}</h3>
                <p>${point.description || ""}</p>
                ${point.image_url ? `<img src="${point.image_url}" width="100%" />` : ""}
                ${point.video_url ? `<p><a href="${point.video_url}" target="_blank">Video</a></p>` : ""}
            </div>
        `;

        const infoWindow = new google.maps.InfoWindow({
            content,
        });

        marker.addListener("click", () => {
            infoWindow.open(map, marker);
        });
    });
}

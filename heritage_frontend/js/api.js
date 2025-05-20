export async function getPoints() {
    const res = await fetch('https://heritage-backend-p1hv.onrender.com/api/points');
    return await res.json();
}

export async function login(email, password) {
    const res = await fetch('https://heritage-backend-p1hv.onrender.com/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    return await res.json();
}
export async function register(username, email, password) {
    const res = await fetch('https://heritage-backend-p1hv.onrender.com/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
    });
    return await res.json();
}

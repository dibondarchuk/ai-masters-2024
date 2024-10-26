const querystring = require('qs');
const axios = require('axios');

const API_URL = 'https://en.wikipedia.org/w/api.php'

const search = async (query, limit = 3) => {
    const response = await axios.get(`${API_URL}?${querystring.stringify({
        action: 'opensearch',
        format: 'json',
        utf8: '',
        namespace: 0,
        limit: limit,
        search: query,
    })}`);

    console.log(response.data)

    return response.data;
}

module.exports = {
    search
}
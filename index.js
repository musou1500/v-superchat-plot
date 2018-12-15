const qs = require('querystring');
const request = require('request-promise');
const cheerio = require('cheerio');
const plotly = require('plotly')(
  process.env.PLOTLY_USERNAME,
  process.env.PLOTLY_APIKEY,
);

const parseAmount = amount => parseInt(amount.trim().replace(/(￥|,)/g, ''));

const fetchRecords = async (year, month) => {
  const baseUrl =
    'https://mamedaifuku.sakura.ne.jp/live_stream/php/ex_disp_super_chat_sum.php';
  const conds = {
    include_super_chat_zero: false,
    channel_order_cond: 'channelCat',
    disp_level: 'channel',
    published_at_ym: `${year * 100 + month}`,
  };

  const $ = await request({
    uri: `${baseUrl}?${qs.stringify(conds)}`,
    transform: body => cheerio.load(body),
  });

  const records = $('#infoTable tr')
    .map(function(i, el) {
      const $cells = $(this).children('td');
      return {
        category: $cells
          .eq(0)
          .text()
          .trim(),
        liveCnt: parseInt(
          $cells
            .eq(2)
            .text()
            .trim(),
        ),
        amount: parseAmount(
          $cells
            .eq(3)
            .text()
            .trim(),
        ),
        channel: {
          name: $cells
            .eq(1)
            .text()
            .trim(),
          url: $cells
            .eq(1)
            .find('a')
            .attr('href'),
        },
      };
    })
    .get();

  return records.slice(1, records.length - 1);
};

const createGraph = records => {
  const data = records.map(rec => {
    return {
      x: rec.liveCnt,
      y: rec.amount / rec.liveCnt,
      name: rec.channel.name,
      mode: 'markers',
      marker: {
        color: 'rgb(164, 194, 244)',
        size: 12,
        line: {
          color: 'white',
          width: 0.5,
        },
      },
      type: 'scatter',
    };
  });

  const layout = {
    title: 'YouTube Live配信数とスパチャ配信単価の分布',
    xaxis: {
      title: '対象配信数(回)',
      showgrid: false,
      zeroline: false
    },
    yaxis: {
      title: 'スパチャ単価(円/配信数)',
      showline: false
    },
  };

  const graphOpts = {
    layout,
    filename: 'line-style',
    fileopt: 'overwrite',
  };

  return new Promise((resolve, reject) => {
    plotly.plot(data, graphOpts, function(err, msg) {
      if (err) reject(err);
      return resolve(msg);
    });
  });
};

(async () => {
  const recMap = {};
  for (let i = 5; i <= 12; ++i) {
    const records = await fetchRecords(2018, i);
    // merge records
    records.forEach(rec => {
      if (!recMap[rec.channel.url]) {
        recMap[rec.channel.url] = rec;
        return;
      }

      const ch = recMap[rec.channel.url];
      ch.liveCnt += rec.liveCnt;
      ch.amount += rec.amount;
    });
  }
  
  const limit = 50;
  const records = Object.keys(recMap)
    .map(k => recMap[k])
    .sort((recA, recB) => recB.amount - recA.amount)
    .slice(0, limit);

  const result = await createGraph(records);
  console.log(result);
})();

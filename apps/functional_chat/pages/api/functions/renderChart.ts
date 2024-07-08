import type { NextApiRequest, NextApiResponse } from 'next';

class Api {
  static async spec(req: NextApiRequest, res: NextApiResponse) {
    res.json({
      json_schema: {
        type: 'function',
        function: {
          name: 'renderChart',
          description: 'Generates an enhanced chart from numeric data using Chart.js. The chart output should be displayed as ![text](image_url) where the image url includes blob: prefix.',
          parameters: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                description: 'Type of the chart (e.g., bar, line, pie, doughnut, radar). Use bar chart if we only have a few data points.',
                enum: ['bar', 'radar']
              },
              data: {
                type: 'object',
                description: 'Chart data and labels',
                properties: {
                  labels: {
                    type: 'array',
                    items: { type: 'string' }
                  },
                  datasets: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        label: { type: 'string' },
                        data: { type: 'array', items: { type: 'number' } },
                        backgroundColor: { 
                          type: 'array', 
                          items: { type: 'string' },
                          description: 'Array of colors for each data point'
                        },
                        borderColor: { type: 'string' },
                        borderWidth: { type: 'number' }
                      },
                      required: ['data']
                    }
                  }
                },
                required: ['labels', 'datasets']
              },
              options: {
                type: 'object',
                description: 'Chart customization options',
                properties: {
                  title: {
                    type: 'object',
                    properties: {
                      display: { type: 'boolean' },
                      text: { type: 'string' },
                      fontSize: { type: 'number' }
                    }
                  },
                  legend: {
                    type: 'object',
                    properties: {
                      display: { type: 'boolean' },
                      position: { type: 'string', enum: ['top', 'left', 'bottom', 'right'] }
                    }
                  },
                  scales: {
                    type: 'object',
                    properties: {
                      yAxes: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            ticks: {
                              type: 'object',
                              properties: {
                                beginAtZero: { type: 'boolean' }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            required: ['type', 'data']
          }
        }
      }
    });
  }

  static async call(req: NextApiRequest, res: NextApiResponse) {
    const { args } = req.query;
    const jsonObj = JSON.parse(args as string);
    if (!jsonObj || typeof jsonObj !== 'object') {
      throw new Error(`Cannot parse render chart arguments: ${args}`);
    }

    // Define default styles
    const defaultColors = [
      'rgba(255, 99, 132, 0.8)',
      'rgba(54, 162, 235, 0.8)',
      'rgba(255, 206, 86, 0.8)',
      'rgba(75, 192, 192, 0.8)',
      'rgba(153, 102, 255, 0.8)',
    ];

    // Apply default styles if not provided
    jsonObj.data.datasets = jsonObj.data.datasets.map((dataset: any, index: number) => ({
      backgroundColor: defaultColors[index % defaultColors.length],
      borderColor: defaultColors[index % defaultColors.length].replace('0.8', '1'),
      borderWidth: 1,
      ...dataset
    }));

    // Add default options if not provided
    jsonObj.options = {
      responsive: true,
      maintainAspectRatio: false,
      title: {
        display: true,
        text: 'Chart Title',
        fontSize: 18,
        fontColor: '#333'
      },
      legend: {
        display: true,
        position: 'top',
        labels: {
          fontColor: '#333'
        }
      },
      scales: {
        yAxes: [{
          ticks: {
            beginAtZero: true,
            fontColor: '#333'
          },
          gridLines: {
            color: 'rgba(0, 0, 0, 0.1)'
          }
        }],
        xAxes: [{
          ticks: {
            fontColor: '#333'
          },
          gridLines: {
            color: 'rgba(0, 0, 0, 0.1)'
          }
        }]
      },
      ...jsonObj.options
    };

    const chartJson = encodeURIComponent(JSON.stringify(jsonObj));
    const url = `https://quickchart.io/chart?c=${chartJson}&width=600&height=400&devicePixelRatio=2`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Error fetching image for args ${args}: ${response.statusText}`);
    }

    const contentType = response.headers.get('Content-Type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<any> {
  const { action } = req.query;
  try {
    if (action === 'spec') {
      return Api.spec(req, res);
    } else if (action === 'call') {
      return Api.call(req, res);
    } else {
      res.status(404).json({ error: 'Action not found' });
    }
  } catch (error) {
    console.error(error);
    if (error instanceof Error) {
      res.status(500).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'An internal server error occurred' });
    }
  }
}
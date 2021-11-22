from lig_sea_level.config import PROJECT_ROOT
from lig_sea_level.inference import load_data
from lig_sea_level.plotting import observations

import arviz as az
full_trace = az.from_netcdf(PROJECT_ROOT/'examples/example.nc')
data = load_data(PROJECT_ROOT/'data/example.csv')

observations(data,full_trace)
plt.show()
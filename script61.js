var vehiculosServices = angular.module('vehiculoServices', ['app.services']);

vehiculosServices.factory('VehiculoServices', ['baseDataService',
	function (baseDataService) {
	    return baseDataService.getService('api/site', false, {
			obtenerVehiculo: { method: 'POST', url: 'api/site/ObtenerVehiculo' },
			obtenerLargoChasis: { method: 'POST', url: 'api/site/obtenerLargoChasis' }
	    });
	}]);
var homesServices = angular.module('recuperarServices', ['app.services']);

homesServices.factory('recuperar', ['baseDataService',
	function (baseDataService) {
	    return baseDataService.getService('api/precarga', true, {
	        obtener: { method: 'GET', url: 'api/precarga/:dominio/:chasis', params: { dominio: '@dominio', chasis: '@chasis' } }
	    });
	}]);

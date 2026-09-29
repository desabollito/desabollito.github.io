var tipoTramitesServices = angular.module('tipoTramiteServices', ['app.services']);

tipoTramitesServices.factory('TipoTramite', ['baseDataService',
	function (baseDataService) {
	    return baseDataService.getService('api/tipoTramite', false, {
	        obtenerTipoDespachoRecibirEmail: { method: 'POST', url: 'api/tipoTramite/obtenerTipoDespachoRecibirEmail', isArray: true }
	    });
	}]);